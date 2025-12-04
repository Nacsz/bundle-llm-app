# app/api/chat.py
import os
import json
import logging
from typing import List, Literal, Optional, Tuple
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel
from openai import OpenAI, AuthenticationError, APIConnectionError, APIStatusError

from app.core.db import SessionLocal
from app import models  # MemoryItem, Bundle 등

logger = logging.getLogger("app.chat")

# ----- FastAPI Router -----
# prefix는 main.py에서 app.include_router(chat.router)로만 쓰고 있어서
# 여기서는 단순 router만 만들고, path는 "/chat"으로 적어줌
router = APIRouter()

# ----- OpenAI 클라이언트 준비 -----
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    logger.info("[chat.py] OPENAI_API_KEY detected (length=%d)", len(OPENAI_API_KEY))
    client: Optional[OpenAI] = OpenAI(api_key=OPENAI_API_KEY)
else:
    logger.warning("[chat.py] OPENAI_API_KEY is NOT set. Using echo mode.")
    client = None

# 한 번에 LLM에 보낼 최대 히스토리 길이
MAX_HISTORY = 10
# memory_context로 붙일 최대 메모 개수
MAX_MEMORY_ITEMS = 8


# ----- Pydantic 모델 -----
class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    user_id: str
    message: str
    history: List[ChatHistoryItem] = []
    selected_bundle_ids: Optional[List[str]] = None


class UsedMemoryItem(BaseModel):
    id: str
    bundle_id: str
    title: Optional[str] = None


class ChatResponse(BaseModel):
    # 프론트에서 기대하는 필드 이름에 맞춰줌 (지금은 answer 사용 중)
    answer: str
    memory_context: str = ""
    used_memories: List[UsedMemoryItem] = []


# ----- helper: 번들 메모 → memory_context 생성 -----
def build_memory_context(
    user_id_str: str,
    bundle_ids: Optional[List[str]],
) -> Tuple[str, List[UsedMemoryItem]]:
    """
    선택된 번들들에서 최근 메모들을 불러와서
    - memory_context 텍스트
    - used_memories 리스트
    를 만들어준다.
    DB 에러가 나면 그냥 빈 값 리턴.
    """
    if not bundle_ids:
        return "", []

    try:
        user_uuid = UUID(user_id_str)
    except Exception:
        # user_id가 UUID 형식이 아니어도 동작은 되게 하고 싶으면,
        # 여기서 user_id 필터를 빼버리는 것도 가능함.
        user_uuid = None

    # bundle_id들을 UUID로 변환 (형식 이상한 건 스킵)
    bundle_uuid_list = []
    for bid in bundle_ids:
        try:
            bundle_uuid_list.append(UUID(bid))
        except Exception:
            continue

    if not bundle_uuid_list:
        return "", []

    db = SessionLocal()
    try:
        q = db.query(models.MemoryItem).filter(
            models.MemoryItem.bundle_id.in_(bundle_uuid_list)
        )
        if user_uuid is not None:
            q = q.filter(models.MemoryItem.user_id == user_uuid)

        # 최신 메모부터 MAX_MEMORY_ITEMS개 가져오기
        q = q.order_by(models.MemoryItem.created_at.desc()).limit(MAX_MEMORY_ITEMS)
        rows = q.all()

        if not rows:
            return "", []

        lines: List[str] = []
        used: List[UsedMemoryItem] = []

        for m in rows:
            # title / summary / original_text 중에서 보기 좋은 것 선택
            title = getattr(m, "title", None)
            summary = getattr(m, "summary", None)
            original_text = getattr(m, "original_text", "")

            text_for_context = summary or original_text or ""
            if len(text_for_context) > 200:
                text_for_context = text_for_context[:200] + "..."

            if title:
                line = f"- ({title}) {text_for_context}"
            else:
                line = f"- {text_for_context}"

            lines.append(line)

            used.append(
                UsedMemoryItem(
                    id=str(m.id),
                    bundle_id=str(m.bundle_id),
                    title=title,
                )
            )

        context_text = "\n".join(lines)
        return context_text, used

    except Exception as e:
        logger.exception("[chat.py] build_memory_context error: %r", e)
        return "", []
    finally:
        db.close()


# ----- /chat 엔드포인트 -----
@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest) -> ChatResponse:
    """
    LLM 호출 + 실패 시 echo 모드로 응답.
    - 최근 MAX_HISTORY개만 LLM에 전달
    - selected_bundle_ids에 해당하는 메모들을 memory_context로 포함
    - 절대 500으로 죽지 않게 방어적으로 작성
    """
    logger.info(
        "[CHAT REQUEST] user_id=%s message=%r history_len=%d selected_bundle_ids=%s",
        req.user_id,
        req.message,
        len(req.history),
        req.selected_bundle_ids,
    )

    # 0. 키가 아예 없는 경우 → 에코 모드
    if client is None:
        logger.warning("[chat.py] No OpenAI client. Returning echo mode.")
        return ChatResponse(
            answer=f"[NO_API_KEY] echo: {req.message}",
            memory_context="",
            used_memories=[],
        )

    # 1. history 슬라이싱 (최근 MAX_HISTORY개만 사용)
    if len(req.history) > MAX_HISTORY:
        history_for_llm = req.history[-MAX_HISTORY:]
    else:
        history_for_llm = req.history

    logger.info(
        "[CHAT] using history_len=%d (original=%d)",
        len(history_for_llm),
        len(req.history),
    )

    # 2. 선택된 번들에서 메모 읽어서 memory_context 구성
    memory_context_text, used_memories = build_memory_context(
        user_id_str=req.user_id,
        bundle_ids=req.selected_bundle_ids,
    )

    # 3. system 프롬프트 구성
    base_system_prompt = (
        "You are an assistant that helps the user with their projects. "
        "Answer in Korean by default unless the user uses another language."
    )

    if memory_context_text:
        system_content = (
            f"{base_system_prompt}\n\n"
            "[memory_context]\n"
            f"{memory_context_text}\n"
            "[/memory_context]"
        )
    else:
        system_content = base_system_prompt

    messages = [
        {"role": "system", "content": system_content},
    ]

    for h in history_for_llm:
        messages.append({"role": h.role, "content": h.content})

    messages.append({"role": "user", "content": req.message})

    # 디버그용 payload 로그 (내용만 보기 좋게 출력)
    try:
        logger.info(
            "[LLM REQUEST PAYLOAD]\n%s",
            json.dumps(
                {
                    "model": "gpt-4.1-mini",
                    "messages": messages,
                    "max_tokens": 512,
                    "temperature": 0.7,
                },
                ensure_ascii=False,
                indent=2,
            ),
        )
    except Exception:
        # 로그에서 예외 나도 실제 요청은 계속 가야 하므로 무시
        pass

    # 4. OpenAI 호출
    try:
        completion = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=messages,
            max_tokens=512,
            temperature=0.7,
        )
        reply_text = completion.choices[0].message.content
        logger.info("[LLM RESPONSE] %r", reply_text)

        return ChatResponse(
            answer=reply_text,
            memory_context=memory_context_text,
            used_memories=used_memories,
        )

    # 5. 다양한 에러 케이스 방어
    except AuthenticationError as e:
        logger.warning("[chat.py] AuthenticationError: %r", e)
        return ChatResponse(
            answer=f"[AUTH_ERROR] API 키 인증 오류로 echo 모드로 응답합니다: {req.message}",
            memory_context=memory_context_text,
            used_memories=used_memories,
        )
    except APIConnectionError as e:
        logger.warning("[chat.py] APIConnectionError: %r", e)
        return ChatResponse(
            answer=f"[NETWORK_ERROR] OpenAI 서버에 연결할 수 없어 echo 모드로 응답합니다: {req.message}",
            memory_context=memory_context_text,
            used_memories=used_memories,
        )
    except APIStatusError as e:
        logger.warning("[chat.py] APIStatusError: %r", e)
        return ChatResponse(
            answer=f"[OPENAI_STATUS_ERROR] 상태코드={e.status_code}, echo: {req.message}",
            memory_context=memory_context_text,
            used_memories=used_memories,
        )
    except Exception as e:
        logger.exception("[chat.py] UNKNOWN ERROR: %r", e)
        return ChatResponse(
            answer=f"[UNKNOWN_ERROR] 서버 내부 오류로 echo 모드로 응답합니다: {req.message}",
            memory_context=memory_context_text,
            used_memories=used_memories,
        )
