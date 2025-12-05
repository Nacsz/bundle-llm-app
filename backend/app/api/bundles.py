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
from app.core.security import get_current_user
from app.models.user import User                
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    현재 로그인한 유저의 번들 목록 조회.
    프론트: GET /bundles/ (쿼리 파라미터 없음)
    """
    logger.info("[list_bundles] current_user.id=%s", current_user.id)

    try:
        bundles = (
            db.query(Bundle)
            .filter(
                Bundle.user_id == current_user.id,
                Bundle.is_archived == False,  # noqa: E712
            )
            .order_by(Bundle.created_at.desc())
            .all()
        )
        return bundles
    except Exception as e:
        logger.exception("[list_bundles] unexpected error: %r", e)
        # 디버깅용 500, 나중에 필요하면 바꿔도 됨
        raise HTTPException(status_code=500, detail="Failed to load bundles")


@router.post("/", response_model=BundleOut)
def create_bundle(
    payload: BundleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    ✅ 요청 바디의 user_id는 무시하고,
      항상 현재 로그인한 유저(current_user.id)를 번들의 owner로 사용.
    """
    bundle = Bundle(
        user_id=current_user.id,          # ← 핵심
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user), 
):
    """
    특정 번들의 메모 목록 조회 (현재 유저 소유 번들만)
    """
    logger.info(
        "[list_memories_for_bundle] user_id=%s bundle_id=%s",
        current_user.id,
        bundle_id,
    )

    # 번들이 내 것인지 확인
    bundle = (
        db.query(Bundle)
        .filter(
            Bundle.id == bundle_id,
            Bundle.user_id == current_user.id,
        )
        .first()
    )
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    memories = (
        db.query(MemoryItem)
        .filter(
            MemoryItem.bundle_id == bundle_id,
            MemoryItem.user_id == current_user.id,
        )
        .order_by(MemoryItem.created_at.desc())
        .all()
    )

    return [memory_to_out(m) for m in memories]

@router.post("/{bundle_id}/memories", response_model=MemoryItemOut)
def create_memory_for_bundle(
    bundle_id: UUID,
    payload: MemoryFromBlockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    번들에 메모 저장 (+ 요약 자동 생성).
    프론트: POST /bundles/{bundle_id}/memories
    """

    logger.info(
        "[create_memory_for_bundle] bundle_id=%s user_id=%s title=%s",
        bundle_id,
        current_user.id,       # 🔁 이제 토큰에서 꺼낸 유저 id 로만 동작
        payload.title,
    )

    # 1) 번들 존재 + 소유자 확인
    bundle = (
        db.query(Bundle)
        .filter(
            Bundle.id == bundle_id,
            Bundle.user_id == current_user.id,   # ⬅️ 소유자 체크
        )
        .first()
    )
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    # 2) 요약 생성
    summary_text = summarize_for_memory(payload.original_text)

    # 3) 메모 생성: user_id 는 current_user.id 로 고정
    memory = MemoryItem(
        user_id=current_user.id,          # ✅ 여기!
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
    current_user: User = Depends(get_current_user), 
):
    """
    메모 수정 + 번들 이동 (현재 유저의 메모만)
    """
    memory = (
        db.query(MemoryItem)
        .filter(
            MemoryItem.id == memory_id,
            MemoryItem.bundle_id == bundle_id,
            MemoryItem.user_id == current_user.id, 
        )
        .first()
    )
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    updated = False
    # ... (기존 title/summary/original_text/metadata/is_pinned/usage_count 업데이트 로직 동일)

    # 🔒 번들 이동 시에도 대상 번들이 내 것인지 확인
    if payload.bundle_id is not None and payload.bundle_id != memory.bundle_id:
        target_bundle = (
            db.query(Bundle)
            .filter(
                Bundle.id == payload.bundle_id,
                Bundle.user_id == current_user.id,
            )
            .first()
        )
        if not target_bundle:
            raise HTTPException(
                status_code=404,
                detail="Target bundle for move not found",
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
    current_user: User = Depends(get_current_user), 
):
    """
    메모 삭제 (현재 유저의 메모만)
    """
    memory = (
        db.query(MemoryItem)
        .filter(
            MemoryItem.id == memory_id,
            MemoryItem.bundle_id == bundle_id,
            MemoryItem.user_id == current_user.id, 
        )
        .first()
    )
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    db.delete(memory)
    db.commit()

    return {"ok": True}

