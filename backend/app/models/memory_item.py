# app/models/memory_item.py

from sqlalchemy import Column, String, Text, TIMESTAMP, Boolean, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.db import Base

class MemoryItem(Base):
    __tablename__ = "memory_items"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    bundle_id = Column(UUID(as_uuid=True), ForeignKey("bundles.id", ondelete="SET NULL"))

    title = Column(String(200))
    original_text = Column(Text, nullable=False)
    summary = Column(Text)

    source_type = Column(String(30), nullable=False)
    source_id = Column(String(255))

    # 🔥 여기가 핵심: 파이썬 속성 이름은 metadata_json,
    # 실제 DB 컬럼 이름은 "metadata" 로 유지
    metadata_json = Column("metadata", JSONB)

    is_pinned = Column(Boolean, nullable=False, server_default="false")
    usage_count = Column(Integer, nullable=False, server_default="0")
    last_used_at = Column(TIMESTAMP(timezone=True))

    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    bundle = relationship("Bundle", back_populates="memories")
