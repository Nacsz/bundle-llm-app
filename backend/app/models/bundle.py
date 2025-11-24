# app/models/bundle.py
from sqlalchemy import Column, String, Text, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.db import Base

class Bundle(Base):
    __tablename__ = "bundles"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    name = Column(String(100), nullable=False)
    description = Column(Text)
    color = Column(String(20))   # UI
    icon = Column(String(50))    # UI
    is_archived = Column(Boolean, nullable=False, server_default="false")

    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    memories = relationship("MemoryItem", back_populates="bundle")
