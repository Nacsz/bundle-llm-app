# app/api/bundles.py

import logging
import os
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from openai import OpenAI

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
    body 예시:
      {
        "user_id": "1111-...",
        "name": "새 번들 이름",
        "description": "",
        "color": "#4F46E5",
        "icon": "�",
        "parent_id": null
      }
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


@router.get("/{bundle_id}/memories", response_model=List[MemoryItemOut])
def list_memories_for_bundle(
    bundle_id: UUID,
    db: Session = Depends(get_db),
):
    """
    특정 번들의 메모 목록 조회.
    프론트: GET /bundles/{bundle_id}/memories

    ❗ 여기서는 ORM 객체를 그대로 리턴하지 않고,
       우리가 직접 dict/스키마로 변환해서 metadata 문제를 우회한다.
    """
    import logging

    logger = logging.getLogger("app.bundles")
    logger.info("[list_memories_for_bundle] bundle_id=%s", bundle_id)

    # 1) ORM으로 메모들 가져오기
    memories = (
        db.query(MemoryItem)
        .filter(MemoryItem.bundle_id == bundle_id)
        .order_by(MemoryItem.created_at.desc())
        .all()
    )

    # 2) Pydantic 모델로 "수동" 변환
    result: List[MemoryItemOut] = []
    for m in memories:
        # ⚠️ metadata 같은 꼬인 필드는 아예 건드리지 않고,
        #     MemoryItemOut이 요구하는 필드만 정확히 채워줌.
        item = MemoryItemOut(
            id=m.id,
            user_id=m.user_id,
            bundle_id=m.bundle_id,
            title=m.title,
            summary=m.summary,
            source_type=m.source_type,
            source_id=m.source_id,
            # metadata 필드가 스키마에 없다면 당연히 안 넣고,
            # 만약 있다면 여기서 dict(...)나 None으로 강제하면 됨.
            is_pinned=m.is_pinned,
            usage_count=m.usage_count,
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

    body 예시:
      {
        "user_id": "1111-...",
        "original_text": "여기에 대화 블록 전체",
        "title": "옵션: 내가 붙이는 제목",
        "source_type": "chat" | "note" | "import",
        "source_id": null,
        "metadata": {...}
      }
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

    return memory
