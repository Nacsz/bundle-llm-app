# app/models/user.py
from sqlalchemy import Column, String, Boolean, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.db import Base
import uuid

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    email = Column(String(255), unique=True, nullable=False)
    username = Column(String(50))
    hashed_password = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
