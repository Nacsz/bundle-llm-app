# app/schemas/bundle.py

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


# --- 요청용 (POST /bundles/) ---
# 👉 이제 user_id는 토큰에서 current_user로 가져오니까
#    여기에는 절대 안 넣는다.
class BundleCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    color: Optional[str] = "#4F46E5"
    icon: Optional[str] = "📁"
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
