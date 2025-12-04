# app/api/chat.py
import json
import logging
import os
from typing import List, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel
from openai import OpenAI, AuthenticationError, APIConnectionError, APIStatusError

# -----------------------------------------------------------
# 로거 설정
# -----------------------------------------------------------
logger = logging.getLogger("app.chat")

# -----------------------------------------------------------
# 라우터
#   main.py 에서: app.include_router(chat.router)
#   → 실제 엔드포인트: POST /chat
# -----------------------------------------------------------
router = APIRouter(prefix="/chat", tags=["chat"])

# -----------------------------------------------------------
# OpenAI 클라이언트 설정 (환경변수에서 바로 읽기)
# -----------------------------------------------------------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if OPENAI_API_KEY:
    logger.info("[chat.py] OPENAI_API_KEY detected (length: %d)", len(OPENAI_API_KEY))
    client: Optional[OpenAI] = OpenAI(api_key=OPENAI_API_KEY)
else:
    logger.warning("[chat.py] OPENAI_API_KEY is NOT set. Using echo mode.")
    client = None


# -----------------------------------------------------------
# Pydantic 모델
# -----------------------------------------------------------
class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    user_id: str
    message: str
    history: List[ChatHistoryItem] = []
    selected_bundle_ids: Optional[List[str]] = None


class ChatResponse(BaseModel):
    # 프론트에서 res.reply 로 읽고 있으니까 reply로 맞춤
    reply: str
    memory_context: str = ""
    used_memories: list = []


# -----------------------------------------------------------
# /chat 엔드포인트
#   - history 마지막 10개만 사용 (토큰 절약)
#   - 에러 나도 항상 200 + ChatResponse 형태로 응답
# -----------------------------------------------------------
@router.post("", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest) -> ChatResponse:
    """
    LLM 호출 + 실패 시 echo 모드로 응답.
    절대 500으로 죽지 않게 방어적으로 작성.
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
            reply=f"[NO_API_KEY] echo: {req.message}",
            memory_context="",
            used_memories=[],
        )

    # 1. history 슬라이스 (마지막 10개만 사용)
    MAX_HISTORY = 10
    if len(req.history) > MAX_HISTORY:
        trimmed_history = req.history[-MAX_HISTORY:]
    else:
        trimmed_history = req.history

    # 나중에 번들 기반 장기 기억이 들어갈 자리
    memory_context = ""

    # 2. messages 구성
    messages = [
        {
            "role": "system",
            "content": (
                "You are an assistant that helps the user with their projects. "
                "Answer in Korean by default unless the user uses another language.\n"
                "[memory_context]\n"
                f"{memory_context}\n"
                "[/memory_context]"
            ),
        }
    ]

    # 히스토리 반영 (슬라이스된 것만)
    for h in trimmed_history:
        messages.append({"role": h.role, "content": h.content})

    # 이번 user 메시지
    messages.append({"role": "user", "content": req.message})

    # 디버깅용: 실제 OpenAI로 보내는 payload 로그
    payload_for_log = {
        "model": "gpt-4.1-mini",
        "messages": messages,
        "max_tokens": 512,
        "temperature": 0.7,
    }
    logger.info("[LLM REQUEST PAYLOAD]\n%s", json.dumps(payload_for_log, ensure_ascii=False, indent=2))

    # 3. OpenAI 호출
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
            reply=reply_text,
            memory_context=memory_context,
            used_memories=[],
        )

    # 4. 다양한 에러 케이스 방어
    except AuthenticationError as e:
        logger.error("[chat.py] AuthenticationError: %r", e)
        return ChatResponse(
            reply=f"[AUTH_ERROR] API 키 인증 오류로 echo 모드로 응답합니다: {req.message}",
            memory_context="",
            used_memories=[],
        )
    except APIConnectionError as e:
        logger.error("[chat.py] APIConnectionError: %r", e)
        return ChatResponse(
            reply=f"[NETWORK_ERROR] OpenAI 서버에 연결할 수 없어 echo 모드로 응답합니다: {req.message}",
            memory_context="",
            used_memories=[],
        )
    except APIStatusError as e:
        logger.error("[chat.py] APIStatusError: %r", e)
        return ChatResponse(
            reply=f"[OPENAI_STATUS_ERROR] 상태코드={e.status_code}, echo: {req.message}",
            memory_context="",
            used_memories=[],
        )
    except Exception as e:
        logger.exception("[chat.py] UNKNOWN ERROR: %r", e)
        return ChatResponse(
            reply=f"[UNKNOWN_ERROR] 서버 내부 오류로 echo 모드로 응답합니다: {req.message}",
            memory_context="",
            used_memories=[],
        )
