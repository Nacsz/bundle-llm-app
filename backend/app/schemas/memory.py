# app/schemas/memory.py
from datetime import datetime
from typing import Optional, Literal, Any, Dict
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MemoryFromBlockCreate(BaseModel):
    original_text: str
    title: Optional[str] = None

    source_type: Literal["chat", "note", "import"] = "chat"
    source_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class MemoryItemOut(BaseModel):
    id: UUID
    user_id: UUID
    bundle_id: Optional[UUID]
    title: Optional[str]
    summary: Optional[str]
    original_text: Optional[str] = None  # 원문 추가
    source_type: str
    source_id: Optional[str]

    metadata: Any | None = None

    is_pinned: bool
    usage_count: int
    last_used_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
