# app/api/bundles.py

import logging
import os
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.bundle import Bundle
from app.models.memory_item import MemoryItem
from app.schemas.bundle import BundleCreate, BundleOut
from app.schemas.memory import MemoryFromBlockCreate, MemoryItemOut

logger = logging.getLogger("app.bundles")

router = APIRouter(
    prefix="/bundles",
    tags=["bundles"],
)

# -------------------------
# OpenAI 클라이언트 (요약용)
# -------------------------

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    logger.info("[bundles] OPENAI_API_KEY detected. Summarization enabled.")
    llm_client: Optional[OpenAI] = OpenAI(api_key=OPENAI_API_KEY)
else:
    logger.warning("[bundles] OPENAI_API_KEY NOT set. Summarization disabled.")
    llm_client = None


def summarize_for_memory(original_text: str) -> Optional[str]:
    """
    MemoryItem.summary에 넣을 요약을 생성.
    - 실패해도 예외를 위로 올리지 않고 None 반환
    """
    if llm_client is None:
        return None

    text = original_text.strip()
    if len(text) < 40:
        # 짧은 텍스트는 그냥 원문을 요약으로 사용
        return text

    try:
        prompt = (
            "다음 텍스트를 나중에 다시 사용할 수 있는 '장기 기억 메모'로 요약해줘.\n"
            "- 핵심 내용만 3~6줄 정도로 정리\n"
            "- 중요한 사람/장소/목표/결론이 있으면 꼭 포함\n"
            "- 한국어로 답변\n\n"
            f"--- 원문 ---\n{text}\n"
        )

        resp = llm_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {
                    "role": "system",
                    "content": "당신은 사용자의 대화/노트를 장기 기억용으로 요약하는 비서입니다.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=256,
            temperature=0.3,
        )
        summary = (resp.choices[0].message.content or "").strip()
        logger.info(
            "[bundles] summarization success. len(original)=%d len(summary)=%d",
            len(text),
            len(summary),
        )
        return summary
    except Exception as e:
        logger.warning("[bundles] summarization failed: %r", e)
        return None


# -------------------------
# Update용 Pydantic 모델
# -------------------------


class BundleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_archived: Optional[bool] = None


class MemoryUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    original_text: Optional[str] = None
    metadata: Optional[dict] = None
    is_pinned: Optional[bool] = None
    usage_count: Optional[int] = None
    # ✅ 번들 이동을 위한 필드
    bundle_id: Optional[UUID] = Field(default=None)


# -------------------------
# Helper: MemoryItem → MemoryItemOut
# -------------------------


def memory_to_out(m: MemoryItem) -> MemoryItemOut:
    return MemoryItemOut(
        id=m.id,
        user_id=m.user_id,
        bundle_id=m.bundle_id,
        title=m.title,
        summary=m.summary,
        original_text=m.original_text,
        source_type=m.source_type,
        source_id=m.source_id,
        metadata=m.metadata_json or {},
        is_pinned=m.is_pinned,
        usage_count=m.usage_count,
        last_used_at=m.last_used_at,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


# -------------------------
# Bundle 엔드포인트들
# -------------------------


@router.get("/", response_model=List[BundleOut])
def list_bundles(
    user_id: UUID,
    db: Session = Depends(get_db),
):
    """
    특정 user_id 의 번들 목록 조회.
    프론트: GET /bundles/?user_id=...
    """
    logger.info("[list_bundles] user_id=%s", user_id)

    bundles = (
        db.query(Bundle)
        .filter(
            Bundle.user_id == user_id,
            Bundle.is_archived == False,  # noqa: E712
        )
        .order_by(Bundle.created_at.desc())
        .all()
    )
    return bundles


@router.post("/", response_model=BundleOut)
def create_bundle(
    payload: BundleCreate,
    db: Session = Depends(get_db),
):
    """
    새 번들 생성.
    프론트: POST /bundles/
    """
    logger.info(
        "[create_bundle] user_id=%s name=%s",
        payload.user_id,
        payload.name,
    )

    bundle = Bundle(
        user_id=payload.user_id,
        parent_id=payload.parent_id,
        name=payload.name,
        description=payload.description,
        color=payload.color,
        icon=payload.icon,
    )
    db.add(bundle)
    db.commit()
    db.refresh(bundle)

    return bundle


@router.patch("/{bundle_id}", response_model=BundleOut)
def update_bundle(
    bundle_id: UUID,
    payload: BundleUpdate,
    db: Session = Depends(get_db),
):
    """
    번들 수정 (이름/설명/색상/아이콘/아카이브 등)
    프론트: PATCH /bundles/{bundle_id}
    """
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    updated = False

    if payload.name is not None:
        bundle.name = payload.name
        updated = True
    if payload.description is not None:
        bundle.description = payload.description
        updated = True
    if payload.color is not None:
        bundle.color = payload.color
        updated = True
    if payload.icon is not None:
        bundle.icon = payload.icon
        updated = True
    if payload.is_archived is not None:
        bundle.is_archived = payload.is_archived
        updated = True

    if updated:
        db.add(bundle)
        db.commit()
        db.refresh(bundle)

    return bundle


@router.delete("/{bundle_id}")
def delete_bundle(
    bundle_id: UUID,
    db: Session = Depends(get_db),
):
    """
    번들 삭제 (안의 메모도 함께 삭제)
    프론트: DELETE /bundles/{bundle_id}
    """
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    # 번들 안의 메모 먼저 삭제
    db.query(MemoryItem).filter(MemoryItem.bundle_id == bundle_id).delete()
    db.delete(bundle)
    db.commit()

    return {"ok": True}


# -------------------------
# Memory 엔드포인트들
# -------------------------


@router.get("/{bundle_id}/memories", response_model=List[MemoryItemOut])
def list_memories_for_bundle(
    bundle_id: UUID,
    db: Session = Depends(get_db),
):
    """
    특정 번들의 메모 목록 조회.
    프론트: GET /bundles/{bundle_id}/memories
    """
    logger.info("[list_memories_for_bundle] bundle_id=%s", bundle_id)

    memories = (
        db.query(MemoryItem)
        .filter(MemoryItem.bundle_id == bundle_id)
        .order_by(MemoryItem.created_at.desc())
        .all()
    )

    return [memory_to_out(m) for m in memories]


@router.post("/{bundle_id}/memories", response_model=MemoryItemOut)
def create_memory_for_bundle(
    bundle_id: UUID,
    payload: MemoryFromBlockCreate,
    db: Session = Depends(get_db),
):
    """
    번들에 메모 저장 (+ 요약 자동 생성).
    프론트: POST /bundles/{bundle_id}/memories
    """
    logger.info(
        "[create_memory_for_bundle] bundle_id=%s user_id=%s title=%s",
        bundle_id,
        payload.user_id,
        payload.title,
    )

    # 번들이 실제 존재하는지 체크
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    # 요약 생성 (실패해도 None이면 그냥 원문만 저장)
    summary_text = summarize_for_memory(payload.original_text)

    memory = MemoryItem(
        user_id=payload.user_id,
        bundle_id=bundle_id,
        original_text=payload.original_text,
        title=payload.title,
        summary=summary_text,
        source_type=payload.source_type,
        source_id=payload.source_id,
        metadata_json=payload.metadata or {},
    )

    db.add(memory)
    db.commit()
    db.refresh(memory)

    return memory_to_out(memory)


@router.patch(
    "/{bundle_id}/memories/{memory_id}",
    response_model=MemoryItemOut,
)
def update_memory_for_bundle(
    bundle_id: UUID,
    memory_id: UUID,
    payload: MemoryUpdate,
    db: Session = Depends(get_db),
):
    """
    메모 내용/메타데이터/핀 상태 수정 + 번들 이동까지 처리.
    프론트: PATCH /bundles/{bundle_id}/memories/{memory_id}
    - bundle_id 필드가 들어오면, 해당 메모를 다른 번들로 이동시킨다.
    """
    memory = (
        db.query(MemoryItem)
        .filter(
            MemoryItem.id == memory_id,
            MemoryItem.bundle_id == bundle_id,
        )
        .first()
    )
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    updated = False

    if payload.title is not None:
        memory.title = payload.title
        updated = True
    if payload.summary is not None:
        memory.summary = payload.summary
        updated = True
    if payload.original_text is not None:
        memory.original_text = payload.original_text
        updated = True
    if payload.metadata is not None:
        memory.metadata_json = payload.metadata
        updated = True
    if payload.is_pinned is not None:
        memory.is_pinned = payload.is_pinned
        updated = True
    if payload.usage_count is not None:
        memory.usage_count = payload.usage_count
        updated = True

    # ✅ 번들 이동 처리
    if payload.bundle_id is not None and payload.bundle_id != memory.bundle_id:
        target_bundle = (
            db.query(Bundle).filter(Bundle.id == payload.bundle_id).first()
        )
        if not target_bundle:
            raise HTTPException(
                status_code=404, detail="Target bundle for move not found"
            )

        memory.bundle_id = payload.bundle_id
        updated = True

    if updated:
        db.add(memory)
        db.commit()
        db.refresh(memory)

    return memory_to_out(memory)


@router.delete("/{bundle_id}/memories/{memory_id}")
def delete_memory_for_bundle(
    bundle_id: UUID,
    memory_id: UUID,
    db: Session = Depends(get_db),
):
    """
    메모 삭제
    프론트: DELETE /bundles/{bundle_id}/memories/{memory_id}
    """
    memory = (
        db.query(MemoryItem)
        .filter(
            MemoryItem.id == memory_id,
            MemoryItem.bundle_id == bundle_id,
        )
        .first()
    )
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    db.delete(memory)
    db.commit()

    return {"ok": True}
