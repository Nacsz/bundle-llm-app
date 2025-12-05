# backend/app/schemas/user.py

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    username: str | None = None


class UserCreate(UserBase):
    password: str   # 회원가입 시 평문 비밀번호 입력


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(UserBase):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        # FastAPI + SQLAlchemy 연동용
        orm_mode = True
        from_attributes = True
