# app/models/memory_item.py

from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Column,
    String,
    Text,
    Boolean,
    Integer,
    DateTime,
    ForeignKey,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.db import Base


class MemoryItem(Base):
    __tablename__ = "memory_items"

    # ---------- 기본 키 / FK ----------
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    bundle_id = Column(PG_UUID(as_uuid=True), ForeignKey("bundles.id"), nullable=True)

    # ---------- 내용 ----------
    title = Column(String(255), nullable=True)
    original_text = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)

    source_type = Column(String(50), nullable=False, default="chat")
    source_id = Column(String(255), nullable=True)

    # � 여기 중요:
    # DB 실제 컬럼 이름은 "metadata" 그대로 두고,
    # 파이썬 속성 이름만 metadata_json 으로 사용
    metadata_json = Column(
        "metadata",           # DB 컬럼 이름
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )

    is_pinned = Column(Boolean, nullable=False, default=False)
    usage_count = Column(Integer, nullable=False, default=0)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        server_onupdate=text("now()"),
    )

    # 관계
    user = relationship("User", backref="memory_items", lazy="joined")
    bundle = relationship("Bundle", backref="memory_items", lazy="joined")
