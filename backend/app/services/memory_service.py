from uuid import UUID
from sqlalchemy.orm import Session
from app.models.bundle import Bundle
from app.models.memory_item import MemoryItem
from app.schemas.memory import MemoryFromBlockCreate
from app.llm.client import summarize_for_memory

def create_memory_from_block(
    db: Session,
    bundle_id: UUID,
    data: MemoryFromBlockCreate,
) -> MemoryItem:
    # 1) 번들 존재 여부만 먼저 체크 (user_id는 일단 나중에)
    bundle = (
        db.query(Bundle)
        .filter(Bundle.id == bundle_id)
        .first()
    )

    if not bundle:
        # 디버깅용으로 bundle_id, user_id도 메시지에 넣어두면 좋음
        raise ValueError(
            f"해당 번들을 찾을 수 없습니다. bundle_id={bundle_id}, 요청 user_id={data.user_id}"
        )

    # (선택) 로컬 개발 단계에서는 user_id도 그냥 한 번 비교만 하고, 틀리면 warning 정도만 찍고 넘어가도 됨
    if str(bundle.user_id) != str(data.user_id):
        # 나중에 진짜 서비스할 때는 여기서 권한 에러로 막으면 됨
        print(
            f"[WARN] 번들 소유자와 요청 user_id 불일치: bundle.user_id={bundle.user_id}, 요청 user_id={data.user_id}"
        )

    # 2) LLM으로 요약 생성
    summary = summarize_for_memory(data.original_text)

    # 3) MemoryItem 생성 및 저장
    memory = MemoryItem(
        user_id=data.user_id,
        bundle_id=bundle_id,
        title=data.title,
        original_text=data.original_text,
        summary=summary,
        source_type=data.source_type,
        source_id=data.source_id,
        metadata_json=data.metadata,
    )

    db.add(memory)
    db.commit()
    db.refresh(memory)

    return memory
