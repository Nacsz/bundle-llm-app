# app/api/bundles.py

import logging
import os
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

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
# 요청 스키마 (수정용)
# -------------------------

class BundleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    parent_id: Optional[UUID] = Field(default=None)
    is_archived: Optional[bool] = None


class MemoryUpdate(BaseModel):
    title: Optional[str] = None
    original_text: Optional[str] = None
    summary: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


# -------------------------
# Endpoints
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


# ----- 번들 수정 / 삭제 -----


@router.patch("/{bundle_id}", response_model=BundleOut)
def update_bundle(
    bundle_id: UUID,
    payload: BundleUpdate,
    db: Session = Depends(get_db),
):
    """
    번들 수정.
    프론트: PATCH /bundles/{bundle_id}
    """
    logger.info("[update_bundle] bundle_id=%s body=%s", bundle_id, payload.dict(exclude_unset=True))

    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    data = payload.dict(exclude_unset=True)

    for field, value in data.items():
        setattr(bundle, field, value)

    if hasattr(bundle, "updated_at"):
        bundle.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(bundle)
    return bundle


@router.delete("/{bundle_id}")
def delete_bundle(
    bundle_id: UUID,
    db: Session = Depends(get_db),
):
    """
    번들 삭제.
    - FK에 ON DELETE CASCADE가 안 걸려 있다면, 번들에 속한 메모도 직접 삭제.
    프론트: DELETE /bundles/{bundle_id}
    """
    logger.info("[delete_bundle] bundle_id=%s", bundle_id)

    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    # 번들에 속한 메모도 함께 삭제 (필요 시)
    db.query(MemoryItem).where(MemoryItem.bundle_id == bundle_id).delete(
        synchronize_session=False
    )

    db.delete(bundle)
    db.commit()
    return {"status": "ok"}


# ----- 번들 내 메모 목록 / 생성 -----


@router.get("/{bundle_id}/memories", response_model=List[MemoryItemOut])
def list_memories_for_bundle(
    bundle_id: UUID,
    db: Session = Depends(get_db),
):
    """
    특정 번들의 메모 목록 조회.
    프론트: GET /bundles/{bundle_id}/memories

    ❗ 여기서는 ORM 객체를 그대로 리턴하지 않고,
       우리가 직접 Pydantic 모델로 변환해서 metadata 문제를 우회한다.
    """
    logger.info("[list_memories_for_bundle] bundle_id=%s", bundle_id)

    memories = (
        db.query(MemoryItem)
        .filter(MemoryItem.bundle_id == bundle_id)
        .order_by(MemoryItem.created_at.desc())
        .all()
    )

    result: List[MemoryItemOut] = []
    for m in memories:
        item = MemoryItemOut(
            id=m.id,
            user_id=m.user_id,
            bundle_id=m.bundle_id,
            title=m.title,
            summary=m.summary,
            original_text=m.original_text,
            source_type=m.source_type,
            source_id=m.source_id,
            metadata=m.metadata_json,
            is_pinned=m.is_pinned,
            usage_count=m.usage_count,
            last_used_at=m.last_used_at,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        result.append(item)

    return result


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

    # ---- 요약 생성 (실패해도 None이면 그냥 원문만 저장) ----
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

    return MemoryItemOut(
        id=memory.id,
        user_id=memory.user_id,
        bundle_id=memory.bundle_id,
        title=memory.title,
        summary=memory.summary,
        original_text=memory.original_text,
        source_type=memory.source_type,
        source_id=memory.source_id,
        metadata=memory.metadata_json,
        is_pinned=memory.is_pinned,
        usage_count=memory.usage_count,
        last_used_at=memory.last_used_at,
        created_at=memory.created_at,
        updated_at=memory.updated_at,
    )


# ----- 메모 수정 / 삭제 -----


@router.patch("/{bundle_id}/memories/{memory_id}", response_model=MemoryItemOut)
def update_memory_for_bundle(
    bundle_id: UUID,
    memory_id: UUID,
    payload: MemoryUpdate,
    db: Session = Depends(get_db),
):
    """
    번들 안 특정 메모 수정.
    프론트: PATCH /bundles/{bundle_id}/memories/{memory_id}
    """
    logger.info(
        "[update_memory_for_bundle] bundle_id=%s memory_id=%s body=%s",
        bundle_id,
        memory_id,
        payload.dict(exclude_unset=True),
    )

    mem = (
        db.query(MemoryItem)
        .filter(
            MemoryItem.id == memory_id,
            MemoryItem.bundle_id == bundle_id,
        )
        .first()
    )
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found")

    data = payload.dict(exclude_unset=True)

    # metadata 처리 (metadata_json 컬럼 사용)
    if "metadata" in data:
        if hasattr(mem, "metadata_json"):
            mem.metadata_json = data.pop("metadata")
        else:
            data.pop("metadata")

    for field, value in data.items():
        setattr(mem, field, value)

    if hasattr(mem, "updated_at"):
        mem.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(mem)

    return MemoryItemOut(
        id=mem.id,
        user_id=mem.user_id,
        bundle_id=mem.bundle_id,
        title=mem.title,
        summary=mem.summary,
        original_text=mem.original_text,
        source_type=mem.source_type,
        source_id=mem.source_id,
        metadata=mem.metadata_json,
        is_pinned=mem.is_pinned,
        usage_count=mem.usage_count,
        last_used_at=mem.last_used_at,
        created_at=mem.created_at,
        updated_at=mem.updated_at,
    )


@router.delete("/{bundle_id}/memories/{memory_id}")
def delete_memory_for_bundle(
    bundle_id: UUID,
    memory_id: UUID,
    db: Session = Depends(get_db),
):
    """
    번들 안 특정 메모 삭제.
    프론트: DELETE /bundles/{bundle_id}/memories/{memory_id}
    """
    logger.info(
        "[delete_memory_for_bundle] bundle_id=%s memory_id=%s",
        bundle_id,
        memory_id,
    )

    mem = (
        db.query(MemoryItem)
        .filter(
            MemoryItem.id == memory_id,
            MemoryItem.bundle_id == bundle_id,
        )
        .first()
    )
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found")

    db.delete(mem)
    db.commit()
    return {"status": "ok"}
