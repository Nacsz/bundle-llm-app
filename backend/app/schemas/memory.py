# app/schemas/memory.py
from pydantic import BaseModel, ConfigDict
from typing import Optional, Literal, Any, Dict
from uuid import UUID

class MemoryFromBlockCreate(BaseModel):
    user_id: UUID
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
    source_type: str
    source_id: Optional[str]
    is_pinned: bool
    usage_count: int
    model_config = ConfigDict(from_attributes=True)


