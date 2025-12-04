# app/api/bundles.py

import logging
from typing import List
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.bundle import Bundle
from app.models.memory_item import MemoryItem

# 스키마들
from app.schemas.bundle import BundleCreate, BundleOut
from app.schemas.memory import MemoryFromBlockCreate, MemoryItemOut

logger = logging.getLogger("app.bundles")

router = APIRouter(
    prefix="/bundles",
    tags=["bundles"],
)

# -------------------------
# Bundles
# -------------------------


@router.get("/", response_model=List[BundleOut])
def list_bundles(
    user_id: UUID,
    db: Session = Depends(get_db),
):
    """
    특정 user_id 의 번들 목록 조회.
    프론트에서는 GET /bundles/?user_id=... 로 호출.
    """
    logger.info("[list_bundles] user_id=%s", user_id)

    bundles = (
        db.query(Bundle)
        .filter(Bundle.user_id == user_id, Bundle.is_archived == False)  # noqa: E712
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
    프론트에서는 POST /bundles/ 로 호출.
    body 예시:
    {
      "user_id": "1111-...",
      "name": "이름",
      "description": "",
      "color": "#4F46E5",
      "icon": "💡"
    }
    """
    logger.info(
        "[create_bundle] user_id=%s name=%s",
        payload.user_id,
        payload.name,
    )

    bundle = Bundle(
        user_id=payload.user_id,
        name=payload.name,
        description=payload.description,
        color=payload.color,
        icon=payload.icon,
    )
    db.add(bundle)
    db.commit()
    db.refresh(bundle)

    return bundle


# -------------------------
# Memories under bundle
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
    return memories


@router.post("/{bundle_id}/memories", response_model=MemoryItemOut)
def create_memory_for_bundle(
    bundle_id: UUID,
    payload: MemoryFromBlockCreate,
    db: Session = Depends(get_db),
):
    """
    번들에 메모 저장.
    프론트: POST /bundles/{bundle_id}/memories
    body:
      {
        "user_id": "...",
        "original_text": "...",
        "title": "...",
        "source_type": "chat" | "note" | "import",
        "source_id": "...",
        "metadata": {...}
      }
    """
    logger.info(
        "[create_memory_for_bundle] bundle_id=%s user_id=%s title=%s",
        bundle_id,
        payload.user_id,
        payload.title,
    )

    # 번들이 실제 존재하는지 체크 (없으면 404)
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    memory = MemoryItem(
        user_id=payload.user_id,
        bundle_id=bundle_id,
        original_text=payload.original_text,
        title=payload.title,
        summary=None,
        source_type=payload.source_type,
        source_id=payload.source_id,
        metadata_json=payload.metadata or {},
    )

    db.add(memory)
    db.commit()
    db.refresh(memory)

    return memory
