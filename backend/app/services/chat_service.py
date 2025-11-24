# app/services/chat_service.py

from sqlalchemy.orm import Session
from uuid import UUID
from typing import List
from datetime import datetime

from app.models.bundle import Bundle
from app.models.memory_item import MemoryItem
from app.llm.client import chat_with_memory

def build_memory_context(
    db: Session,
    user_id: UUID,
    bundle_ids: List[UUID],
    per_bundle_limit: int = 5,
) -> str:
    if not bundle_ids:
        return ""

    bundles = (
        db.query(Bundle)
        .filter(Bundle.id.in_(bundle_ids), Bundle.user_id == user_id)
        .all()
    )

    if not bundles:
        return ""

    lines: list[str] = []

    for bundle in bundles:
        lines.append(f"### Bundle: {bundle.name}")
        if bundle.description:
            lines.append(f"- 설명: {bundle.description}")

        memories = (
            db.query(MemoryItem)
            .filter(
                MemoryItem.user_id == user_id,
                MemoryItem.bundle_id == bundle.id,
            )
            .order_by(
                MemoryItem.is_pinned.desc(),      # pinned 우선
                MemoryItem.usage_count.desc(),    # 많이 쓰인 것 우선
                MemoryItem.created_at.desc(),
            )
            .limit(per_bundle_limit)
            .all()
        )

        if not memories:
            lines.append("- (저장된 메모 없음)")
            lines.append("")
            continue

        for m in memories:
            label = f"[{m.title}] " if m.title else ""
            summary_or_original = m.summary or m.original_text
            lines.append(f"- {label}{summary_or_original}")

        lines.append("")  # 번들 간 공백

    return "\n".join(lines).strip()


def update_usage_stats(
    db: Session,
    used_memories: List[MemoryItem],
):
    """사용된 메모들의 usage_count/last_used_at 업데이트."""
    now = datetime.utcnow()
    for m in used_memories:
        m.usage_count = (m.usage_count or 0) + 1
        m.last_used_at = now
    db.commit()


def chat_with_bundles(
    db: Session,
    user_id: UUID,
    message: str,
    selected_bundle_ids: List[UUID],
    history: list[dict] | None = None,
) -> tuple[str, str]:
    # 1) 메모리 컨텍스트 문자열 생성
    memory_context = build_memory_context(
        db=db,
        user_id=user_id,
        bundle_ids=selected_bundle_ids,
        per_bundle_limit=5,
    )

    # 2) LLM 호출
    answer = chat_with_memory(
        memory_context=memory_context,
        user_message=message,
        history=history,
    )

    # 3) usage_count/last_used_at 업데이트 (선택)
    if selected_bundle_ids:
        used_memories = (
            db.query(MemoryItem)
            .filter(
                MemoryItem.user_id == user_id,
                MemoryItem.bundle_id.in_(selected_bundle_ids),
            )
            .order_by(
                MemoryItem.is_pinned.desc(),
                MemoryItem.usage_count.desc(),
                MemoryItem.created_at.desc(),
            )
            .limit(5 * len(selected_bundle_ids))
            .all()
        )
        update_usage_stats(db, used_memories)

    return answer, memory_context
