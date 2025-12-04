# app/schemas/bundle.py

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


# --- 요청용 (POST /bundles/) ---
class BundleCreate(BaseModel):
    user_id: UUID           # "1111-..." → UUID로 파싱됨
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    parent_id: Optional[UUID] = None   # 상위 번들 (트리 구조용, 없어도 됨)


# --- 응답용 (GET/POST 응답) ---
class BundleOut(BaseModel):
    id: UUID
    user_id: UUID
    parent_id: Optional[UUID] = None

    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None

    is_archived: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True  # (= orm_mode = True)
