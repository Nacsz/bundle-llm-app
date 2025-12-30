# app/api/bundles.py

import logging
import os
import json
from typing import List, Optional, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Header
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.bundle import Bundle
from app.models.memory_item import MemoryItem
from app.schemas.bundle import BundleCreate, BundleOut
from app.schemas.memory import MemoryFromBlockCreate, MemoryItemOut
from app.core.security import get_current_user
from app.models.user import User

logger = logging.getLogger("app.bundles")

router = APIRouter(
    prefix="/bundles",
    tags=["bundles"],
)

# -------------------------
# OpenAI 클라이언트 (요약/정리용)
# -------------------------

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or ""
SHARED_API_PASSWORD = os.getenv("SHARED_API_PASSWORD") or ""

if OPENAI_API_KEY:
    logger.info("[bundles] OPENAI_API_KEY detected (server shared key 가능).")
else:
    logger.warning("[bundles] OPENAI_API_KEY NOT set.")

if SHARED_API_PASSWORD:
    logger.info("[bundles] SHARED_API_PASSWORD is set.")
else:
    logger.warning("[bundles] SHARED_API_PASSWORD NOT set.")


def build_openai_client(
    user_api_key: Optional[str],
    shared_api_password: Optional[str],
) -> Optional[OpenAI]:
    # 1) 사용자 개인 키
    if user_api_key:
        try:
            return OpenAI(api_key=user_api_key)
        except Exception as e:
            logger.warning("[bundles] invalid user OpenAI key: %r", e)

    # 2) 평가용 비밀번호 → 서버 공용 키
    if (
        shared_api_password
        and SHARED_API_PASSWORD
        and shared_api_password == SHARED_API_PASSWORD
        and OPENAI_API_KEY
    ):
        try:
            logger.info(
                "[bundles] using SERVER shared OPENAI_API_KEY via password."
            )
            return OpenAI(api_key=OPENAI_API_KEY)
        except Exception as e:
            logger.warning("[bundles] failed to build shared OpenAI client: %r", e)

    return None

def summarize_for_memory(
    original_text: str,
    client: Optional[OpenAI],
) -> Optional[str]:
    """
    MemoryItem.summary에 넣을 요약을 생성.
    - 실패해도 예외를 위로 올리지 않고 None 반환
    """
    if client is None:
        # 키가 없으면 요약 생략
        return None

    text = original_text.strip()
    if len(text) < 40:
        # 짧은 텍스트는 그냥 원문을 요약으로 사용
        return text

    try:
        prompt = (
            "다음 텍스트를 나중에 다시 사용할 수 있는 '장기 기억 메모'로 요약해줘.\n"
            "- 핵심 내용만 3~6줄 정도로 정리\n"
            "- 중요한 사람/장소/목표/결론이 있으면 꼭 포함\n"
            "- 한국어로 답변\n\n"
            f"--- 원문 ---\n{text}\n"
        )

        resp = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {
                    "role": "system",
                    "content": "당신은 사용자의 대화/노트를 장기 기억용으로 요약하는 비서입니다.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=256,
            temperature=0.3,
        )
        summary = (resp.choices[0].message.content or "").strip()
        logger.info(
            "[bundles] summarization success. len(original)=%d len(summary)=%d",
            len(text),
            len(summary),
        )
        return summary
    except Exception as e:
        logger.warning("[bundles] summarization failed: %r", e)
        return None

def generate_memory_title(
    original_text: str,
    client: Optional[OpenAI],
) -> str:
    """
    메모 제목용 짧은 키워드 생성.
    - 가능하면 LLM으로 1줄짜리 짧은 제목 생성
    - LLM이 없거나 실패하면 첫 줄 20자 정도 잘라서 사용
    """
    text = (original_text or "").strip()
    if not text:
        return "메모"

    # LLM 없이도 돌아가도록 먼저 fallback 로직부터 정의
    def simple_fallback() -> str:
        first_line = text.splitlines()[0]
        # "사용자:", "LLM:" 같은 접두어 제거
        for prefix in ["사용자:", "User:", "LLM:", "Assistant:"]:
            if first_line.startswith(prefix):
                first_line = first_line[len(prefix) :].strip()
        first_line = first_line or "메모"
        return first_line[:20] + ("…" if len(first_line) > 20 else "")

    # LLM 키 없으면 바로 fallback
    if client is None:
        return simple_fallback()

    try:
        prompt = (
            "다음 전체 대화/텍스트의 내용을 대표하는 **아주 짧은 제목**을 만들어 주세요.\n"
            "- 한국어로 1~6단어 정도\n"
            "- 따옴표나 마침표 없이, 제목만 출력\n"
            "- 예시: 인사, 중국 음식, 시험 계획, 프로젝트 회의 메모\n\n"
            f"--- 내용 ---\n{text}\n"
        )
        resp = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {
                    "role": "system",
                    "content": "너는 사용자의 메모에 붙일 짧은 제목을 만드는 비서야.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=32,
            temperature=0.3,
        )
        title = (resp.choices[0].message.content or "").strip()
        # 너무 길거나 이상하면 fallback
        if not title or len(title) > 30:
            return simple_fallback()
        return title
    except Exception as e:
        logger.warning("[bundles] title generation failed: %r", e)
        return simple_fallback()

# -------------------------
# Update/정리 Pydantic 모델
# -------------------------


class BundleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_archived: Optional[bool] = None
    parent_id: Optional[UUID] = None 

class MemoryUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    original_text: Optional[str] = None
    metadata: Optional[dict] = None
    is_pinned: Optional[bool] = None
    usage_count: Optional[int] = None
    # 번들 이동용
    bundle_id: Optional[UUID] = Field(default=None)


# 번들 자동 그룹핑용 스키마
class AutoGroupCandidate(BaseModel):
    parent_name: str               # 새로 만들 상위 번들 이름 (예: "국가")
    child_bundle_ids: List[str]    # 이 밑으로 들어갈 기존 번들 id 리스트 (UUID 문자열)


class AutoGroupPreviewResponse(BaseModel):
    groups: List[AutoGroupCandidate]


class AutoGroupApplyRequest(BaseModel):
    groups: List[AutoGroupCandidate]


# -------------------------
# Helper: MemoryItem → MemoryItemOut
# -------------------------


def memory_to_out(m: MemoryItem) -> MemoryItemOut:
    return MemoryItemOut(
        id=m.id,
        user_id=m.user_id,
        bundle_id=m.bundle_id,
        title=m.title,
        summary=m.summary,
        original_text=m.original_text,
        source_type=m.source_type,
        source_id=m.source_id,
        metadata=m.metadata_json or {},
        is_pinned=m.is_pinned,
        usage_count=m.usage_count,
        last_used_at=m.last_used_at,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


# -------------------------
# Bundle 엔드포인트들
# -------------------------


@router.get("/", response_model=List[BundleOut])
def list_bundles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    현재 로그인한 유저의 번들 목록 조회.
    프론트: GET /bundles/ (쿼리 파라미터 없음)
    """
    logger.info("[list_bundles] current_user.id=%s", current_user.id)

    try:
        bundles = (
            db.query(Bundle)
            .filter(
                Bundle.user_id == current_user.id,
                Bundle.is_archived == False,  # noqa: E712
            )
            .order_by(Bundle.created_at.desc())
            .all()
        )
        return bundles
    except Exception as e:
        logger.exception("[list_bundles] unexpected error: %r", e)
        raise HTTPException(status_code=500, detail="Failed to load bundles")


@router.post("/", response_model=BundleOut)
def create_bundle(
    payload: BundleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    요청 바디의 user_id는 무시하고,
    항상 현재 로그인한 유저(current_user.id)를 번들의 owner로 사용.
    """
    bundle = Bundle(
        user_id=current_user.id,
        parent_id=payload.parent_id,
        name=payload.name,
        description=payload.description,
        color=payload.color,
        icon=payload.icon,
    )
    db.add(bundle)
    db.commit()
    db.refresh(bundle)
    return bundle


@router.patch("/{bundle_id}", response_model=BundleOut)
def update_bundle(
    bundle_id: UUID,
    payload: BundleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    번들 수정 (이름/설명/색상/아이콘/아카이브 등)
    프론트: PATCH /bundles/{bundle_id}
    """
    bundle = (
        db.query(Bundle)
        .filter(
            Bundle.id == bundle_id,
            Bundle.user_id == current_user.id,
        )
        .first()
    )
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    updated = False

    if payload.name is not None:
        bundle.name = payload.name
        updated = True
    if payload.description is not None:
        bundle.description = payload.description
        updated = True
    if payload.color is not None:
        bundle.color = payload.color
        updated = True
    if payload.icon is not None:
        bundle.icon = payload.icon
        updated = True
    if payload.is_archived is not None:
        bundle.is_archived = payload.is_archived
        updated = True

    if payload.parent_id is not None:
        bundle.parent_id = payload.parent_id
        updated = True

    if updated:
        db.add(bundle)
        db.commit()
        db.refresh(bundle)

    return bundle


@router.delete("/{bundle_id}")
def delete_bundle(
    bundle_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    번들 삭제 (하위 번들 + 그 안의 메모까지 모두 삭제)
    프론트: DELETE /bundles/{bundle_id}
    """
    # 1) 우선 내가 소유한 번들인지 확인
    root_bundle = (
        db.query(Bundle)
        .filter(
            Bundle.id == bundle_id,
            Bundle.user_id == current_user.id,
        )
        .first()
    )
    if not root_bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    # 2) 나 + 모든 하위 번들의 id 수집 (DFS)
    ids_to_delete: list[UUID] = []
    stack: list[UUID] = [root_bundle.id]

    while stack:
        cur = stack.pop()
        if cur in ids_to_delete:
            continue
        ids_to_delete.append(cur)

        children = (
            db.query(Bundle)
            .filter(
                Bundle.user_id == current_user.id,
                Bundle.parent_id == cur,
            )
            .all()
        )
        for child in children:
            stack.append(child.id)

    try:
        if ids_to_delete:
            # 3) 해당 번들들에 속한 메모 먼저 삭제
            db.query(MemoryItem).filter(
                MemoryItem.user_id == current_user.id,
                MemoryItem.bundle_id.in_(ids_to_delete),
            ).delete(synchronize_session=False)

            # 4) 번들들 삭제
            db.query(Bundle).filter(
                Bundle.user_id == current_user.id,
                Bundle.id.in_(ids_to_delete),
            ).delete(synchronize_session=False)

        db.commit()

        logger.info(
            "[delete_bundle] user_id=%s deleted_bundle_ids=%s",
            current_user.id,
            [str(bid) for bid in ids_to_delete],
        )

        return {
          "ok": True,
          "deleted_bundle_ids": [str(bid) for bid in ids_to_delete],
        }
    except Exception as e:
        db.rollback()
        logger.exception("[delete_bundle] failed: %r", e)
        raise HTTPException(status_code=500, detail="Failed to delete bundle")

# -------------------------
# 번들 자동 정리 (그룹핑)
# -------------------------


@router.post("/auto-group/preview", response_model=AutoGroupPreviewResponse)
async def preview_auto_group_bundles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    # 프론트에서 보내는 헤더 (개인 키 or 평가용 비밀번호)
    x_openai_api_key: Optional[str] = Header(None, alias="X-OpenAI-Api-Key"),
    x_shared_api_password: Optional[str] = Header(
        None, alias="X-Shared-Api-Password"
    ),
):
    """
    번들 자동 정리 미리보기.

    - 현재 유저의 번들을 전부 가져온 다음
    - 헤더 / 환경변수에서 OpenAI 클라이언트를 만든 뒤
    - LLM에게 "어떤 상위 번들로 묶을지"를 물어본다.
    - 실패하거나 클라이언트가 없으면 500 내지 않고 groups 빈 배열 리턴.
    """
    bundles = (
        db.query(Bundle)
        .filter(
            Bundle.user_id == current_user.id,
            Bundle.is_archived == False,  # noqa: E712
        )
        .order_by(Bundle.created_at.asc())
        .all()
    )

    # 번들이 너무 적으면 그냥 리턴
    if len(bundles) < 2:
        return AutoGroupPreviewResponse(groups=[])

    # OpenAI 클라이언트 생성 (개인 키 / 평가용 비밀번호 + 서버 키)
    client = build_openai_client(x_openai_api_key, x_shared_api_password)
    if client is None:
        logger.warning(
            "[auto_group_preview] no OpenAI client "
            "(user_key=%s, shared_pwd=%s) → return empty groups",
            bool(x_openai_api_key),
            bool(x_shared_api_password),
        )
        return AutoGroupPreviewResponse(groups=[])

    # LLM에 넘길 번들 리스트 (이름 기준으로 묶게 시킴)
    items = [{"id": str(b.id), "name": b.name} for b in bundles]
    items_json = json.dumps(items, ensure_ascii=False)

    system_msg = (
        "당신은 사용자의 '번들(폴더)' 이름을 보고, 의미적으로 비슷한 번들을 "
        "상위 카테고리로 묶어 주는 도우미입니다. "
        "반드시 JSON 객체 하나만 출력하고, 설명 문장은 쓰지 마세요."
    )

    prompt = f"""
다음은 사용자가 만든 '번들(폴더)' 목록이야.
비슷한 것끼리 상위 카테고리를 만들어서 묶어줘.

규칙:
- 각 그룹은 다음 필드를 가진다.
  - parent_name: 새로 만들 상위 번들 이름 (한국어 4~12자 정도의 명사구)
  - children: 이 그룹에 넣을 기존 번들의 '이름' 문자열 리스트
- parent_name 에는 "사용자:", "LLM:" 과 같은 말하는 사람 접두어나
  이모지, 불필요한 기호를 넣지 마.
- 콜론(:) 으로 끝나지 않게 해.
- 애매하면 그룹을 만들지 말고, 소수의 그룹만 만들어.

반환 형식은 반드시 아래 JSON 예시와 같은 형태로, JSON 객체 한 개만 출력해.

{{
  "groups": [
    {{
      "parent_name": "국가",
      "children": ["일본", "중국", "한국"]
    }},
    {{
      "parent_name": "음식",
      "children": ["한국 음식", "일본 음식"]
    }}
  ]
}}

설명 문장은 절대 쓰지 말고, 위 형식의 JSON 객체 하나만 출력해.

번들 목록:
{items_json}
"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": prompt},
            ],
            max_tokens=512,
            temperature=0.2,
        )
        raw = (resp.choices[0].message.content or "").strip()
        logger.info("[auto_group_preview] raw LLM response: %s", raw)
        obj = json.loads(raw)
    except Exception as e:
        logger.exception("[auto_group_preview] LLM call or JSON parse failed: %r", e)
        # LLM 에러나 JSON 파싱 실패해도 500 안 내고 빈 결과
        return AutoGroupPreviewResponse(groups=[])

    # 번들 "이름" → id 리스트 매핑 (같은 이름 여러 개 대비)
    name_to_ids: Dict[str, List[str]] = {}
    for b in bundles:
        name_to_ids.setdefault(b.name, []).append(str(b.id))

    groups: List[AutoGroupCandidate] = []
    try:
        for g in obj.get("groups", []):
            parent_name = str(g.get("parent_name", "")).strip()
            if not parent_name:
                continue

            children_names = g.get("children", [])
            if not isinstance(children_names, list):
                continue

            child_bundle_ids: List[str] = []
            for cname in children_names:
                cname_str = str(cname).strip()
                if not cname_str:
                    continue
                # 같은 이름 번들이 여러 개 있을 수도 있으니 전부 추가
                child_bundle_ids.extend(name_to_ids.get(cname_str, []))

            # 실제로 매핑된 번들이 있어야 유효 그룹
            if not child_bundle_ids:
                continue

            groups.append(
                AutoGroupCandidate(
                    parent_name=parent_name,
                    child_bundle_ids=child_bundle_ids,
                )
            )
    except Exception as e:
        logger.exception("[auto_group_preview] build groups failed: %r", e)
        return AutoGroupPreviewResponse(groups=[])

    logger.info(
        "[auto_group_preview] user_id=%s, bundle_count=%d, group_count=%d",
        current_user.id,
        len(bundles),
        len(groups),
    )
    return AutoGroupPreviewResponse(groups=groups)


@router.post("/auto-group/apply", response_model=List[BundleOut])
def apply_auto_group(
    payload: AutoGroupApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    미리보기에서 확정된 그룹 정보를 받아:
    1) parent_name 으로 새 번들을 만들고,
    2) child_bundle_ids 에 해당하는 기존 번들의 parent_id 를 새 번들로 설정한다.
    """
    logger.info(
        "[apply_auto_group] user_id=%s groups=%s",
        current_user.id,
        payload.groups,
    )

    if not payload.groups:
        # 정리할 게 없으면 그냥 현재 번들 목록 반환
        bundles = (
            db.query(Bundle)
            .filter(
                Bundle.user_id == current_user.id,
                Bundle.is_archived == False,  # noqa: E712
            )
            .order_by(Bundle.created_at.desc())
            .all()
        )
        return bundles

    try:
        # child id 들 → 실제 번들 객체 캐시
        bundle_map: dict[UUID, Bundle] = {}

        all_child_ids: List[UUID] = []
        for g in payload.groups:
            for cid in g.child_bundle_ids:
                try:
                    all_child_ids.append(UUID(cid))
                except Exception:
                    logger.warning("[apply_auto_group] invalid UUID: %s", cid)

        if all_child_ids:
            existing_children = (
                db.query(Bundle)
                .filter(
                    Bundle.user_id == current_user.id,
                    Bundle.id.in_(all_child_ids),
                )
                .all()
            )
            for b in existing_children:
                bundle_map[b.id] = b

        # 그룹별로 새 parent 번들 만들고, child.parent_id 업데이트
        for g in payload.groups:
            parent_name = g.parent_name.strip()
            if not parent_name:
                continue

            # 이미 같은 이름의 상위 번들이 있는지 확인 (선택 사항)
            existing_parent = (
                db.query(Bundle)
                .filter(
                    Bundle.user_id == current_user.id,
                    Bundle.parent_id.is_(None),
                    Bundle.name == parent_name,
                )
                .first()
            )

            if existing_parent:
                parent_bundle = existing_parent
            else:
                parent_bundle = Bundle(
                    user_id=current_user.id,
                    parent_id=None,
                    name=parent_name,
                    description="자동 정리로 생성된 상위 번들",
                    color="#4F46E5",
                    icon="�",
                )
                db.add(parent_bundle)
                db.flush()  # id 확보용

            for cid_str in g.child_bundle_ids:
                try:
                    cid = UUID(cid_str)
                except Exception:
                    logger.warning(
                        "[apply_auto_group] skip invalid child id=%s", cid_str
                    )
                    continue

                child = bundle_map.get(cid)
                if not child:
                    logger.warning(
                        "[apply_auto_group] child bundle not found: %s", cid
                    )
                    continue

                child.parent_id = parent_bundle.id
                db.add(child)

        db.commit()

        # 최종 번들 목록 반환
        bundles = (
            db.query(Bundle)
            .filter(
                Bundle.user_id == current_user.id,
                Bundle.is_archived == False,  # noqa: E712
            )
            .order_by(Bundle.created_at.desc())
            .all()
        )
        return bundles

    except Exception as e:
        logger.exception("[apply_auto_group] unexpected error: %r", e)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to apply auto grouping")

# -------------------------
# Memory 엔드포인트들
# -------------------------


@router.get("/{bundle_id}/memories", response_model=List[MemoryItemOut])
def list_memories_for_bundle(
    bundle_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    특정 번들의 메모 목록 조회 (현재 유저 소유 번들만)
    """
    logger.info(
        "[list_memories_for_bundle] user_id=%s bundle_id=%s",
        current_user.id,
        bundle_id,
    )

    # 번들이 내 것인지 확인
    bundle = (
        db.query(Bundle)
        .filter(
            Bundle.id == bundle_id,
            Bundle.user_id == current_user.id,
        )
        .first()
    )
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    memories = (
        db.query(MemoryItem)
        .filter(
            MemoryItem.bundle_id == bundle_id,
            MemoryItem.user_id == current_user.id,
        )
        .order_by(MemoryItem.created_at.desc())
        .all()
    )

    return [memory_to_out(m) for m in memories]


@router.post("/{bundle_id}/memories", response_model=MemoryItemOut)
def create_memory_for_bundle(
    bundle_id: UUID,
    payload: MemoryFromBlockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    x_openai_key: Optional[str] = Header(None),
    x_shared_api_password: Optional[str] = Header(None),
):
    """
    번들에 메모 저장 (+ 요약 자동 생성).
    프론트: POST /bundles/{bundle_id}/memories
    """

    logger.info(
        "[create_memory_for_bundle] bundle_id=%s user_id=%s title=%s",
        bundle_id,
        current_user.id,
        payload.title,
    )

    # 1) 번들 존재 + 소유자 확인
    bundle = (
        db.query(Bundle)
        .filter(
            Bundle.id == bundle_id,
            Bundle.user_id == current_user.id,
        )
        .first()
    )
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

        # 2) OpenAI 클라이언트 생성 후 요약
    client = build_openai_client(x_openai_key, x_shared_api_password)
    summary_text = summarize_for_memory(payload.original_text, client)

    # 2-1) 제목 정리: 너무 길거나 비어 있으면 자동 생성
    raw_title = (payload.title or "").strip() if hasattr(payload, "title") else ""
    if not raw_title or len(raw_title) > 40:
        # 프론트에서 대화 전체를 title로 보내더라도 무시하고 새로 만듦
        title_for_memory = generate_memory_title(payload.original_text, client)
    else:
        title_for_memory = raw_title

    # 3) 메모 생성
    memory = MemoryItem(
        user_id=current_user.id,
        bundle_id=bundle_id,
        original_text=payload.original_text,
        title=title_for_memory,
        summary=summary_text,
        source_type=payload.source_type,
        source_id=payload.source_id,
        metadata_json=payload.metadata or {},
    )


    db.add(memory)
    db.commit()
    db.refresh(memory)

    return memory_to_out(memory)



@router.patch(
    "/{bundle_id}/memories/{memory_id}",
    response_model=MemoryItemOut,
)
def update_memory_for_bundle(
    bundle_id: UUID,
    memory_id: UUID,
    payload: MemoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    메모 수정 + 번들 이동 (현재 유저의 메모만)
    """
    memory = (
        db.query(MemoryItem)
        .filter(
            MemoryItem.id == memory_id,
            MemoryItem.bundle_id == bundle_id,
            MemoryItem.user_id == current_user.id,
        )
        .first()
    )
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    updated = False

    if payload.title is not None:
        memory.title = payload.title
        updated = True
    if payload.summary is not None:
        memory.summary = payload.summary
        updated = True
    if payload.original_text is not None:
        memory.original_text = payload.original_text
        updated = True
    if payload.metadata is not None:
        memory.metadata_json = payload.metadata
        updated = True
    if payload.is_pinned is not None:
        memory.is_pinned = payload.is_pinned
        updated = True
    if payload.usage_count is not None:
        memory.usage_count = payload.usage_count
        updated = True

    # 번들 이동 시에도 대상 번들이 내 것인지 확인
    if payload.bundle_id is not None and payload.bundle_id != memory.bundle_id:
        target_bundle = (
            db.query(Bundle)
            .filter(
                Bundle.id == payload.bundle_id,
                Bundle.user_id == current_user.id,
            )
            .first()
        )
        if not target_bundle:
            raise HTTPException(
                status_code=404,
                detail="Target bundle for move not found",
            )

        memory.bundle_id = payload.bundle_id
        updated = True

    if updated:
        db.add(memory)
        db.commit()
        db.refresh(memory)

    return memory_to_out(memory)


@router.delete("/{bundle_id}/memories/{memory_id}")
def delete_memory_for_bundle(
    bundle_id: UUID,
    memory_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    메모 삭제 (현재 유저의 메모만)
    """
    memory = (
        db.query(MemoryItem)
        .filter(
            MemoryItem.id == memory_id,
            MemoryItem.bundle_id == bundle_id,
            MemoryItem.user_id == current_user.id,
        )
        .first()
    )
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    db.delete(memory)
    db.commit()

    return {"ok": True}

