# app/api/bundles.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.db import get_db
from app.schemas.memory import MemoryFromBlockCreate, MemoryItemOut
from app.services.memory_service import create_memory_from_block

from app.schemas.bundle import BundleOut
from app.models.bundle import Bundle
from app.models.memory_item import MemoryItem

router = APIRouter(prefix="/bundles", tags=["bundles"])

@router.post("/{bundle_id}/memories", response_model=MemoryItemOut)
def add_memory_from_block(
    bundle_id: UUID,
    payload: MemoryFromBlockCreate,
    db: Session = Depends(get_db),
):
    try:
        memory = create_memory_from_block(db, bundle_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return memory

@router.get("/", response_model=list[BundleOut])
def list_bundles(
    user_id: UUID,  # 쿼리 파라미터 ?user_id=...
    db: Session = Depends(get_db),
):
    bundles = (
        db.query(Bundle)
        .filter(Bundle.user_id == user_id)
        .order_by(Bundle.created_at.desc())
        .all()
    )
    return bundles

@router.get("/{bundle_id}/memories", response_model=list[MemoryItemOut])
def list_memories_for_bundle(
    bundle_id: UUID,
    db: Session = Depends(get_db),
):
    memories = (
        db.query(MemoryItem)
        .filter(MemoryItem.bundle_id == bundle_id)
        .order_by(MemoryItem.created_at.desc())
        .all()
    )
    return memories
