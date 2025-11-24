# app/schemas/bundle.py

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class BundleOut(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True  # (= 예전 orm_mode = True)
