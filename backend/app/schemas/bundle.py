# app/schemas/bundle.py

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class BundleCreate(BaseModel):
    """
    번들 생성용 입력 스키마
    - POST /bundles/ 에서 사용
    """
    user_id: UUID
    name: str
    description: str | None = None
    color: str | None = None
    icon: str | None = None


class BundleOut(BaseModel):
    """
    번들 조회용 출력 스키마
    - GET /bundles/
    - POST /bundles/ 응답에서 사용
    """
    id: UUID
    user_id: UUID
    name: str
    description: str | None = None
    color: str | None = None
    icon: str | None = None
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        # SQLAlchemy ORM 객체에서 바로 읽기
        from_attributes = True  # (= 예전 orm_mode = True)
