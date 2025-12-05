# app/models/bundle.py

from sqlalchemy import Column, String, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.db import Base


class Bundle(Base):
    __tablename__ = "bundles"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )

    # 어떤 유저의 번들인지
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # 번들 트리 구조를 위한 부모 번들 (없으면 루트 번들)
    parent_id = Column(
        UUID(as_uuid=True),
        ForeignKey("bundles.id", ondelete="CASCADE"),
        nullable=True,
    )

    name = Column(String(200), nullable=False)
    description = Column(String(500))
    color = Column(String(20))
    icon = Column(String(10))
    is_archived = Column(Boolean, nullable=False, server_default="false")

    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # self-referential 관계 (폴더/하위 폴더 구조)
    parent = relationship(
        "Bundle",
        remote_side=[id],
        backref="children",
    )

    # MemoryItem 쪽에서 back_populates="bundle" 사용 중
    memories = relationship(
        "MemoryItem",
        back_populates="bundle",
        cascade="all, delete-orphan",
    )
