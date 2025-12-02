# app/api/chat.py
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat_service import chat_with_bundles

router = APIRouter(prefix="/chat", tags=["chat"])

@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
):
    answer, memory_context = chat_with_bundles(
        db=db,
        user_id=payload.user_id,
        message=payload.message,
        selected_bundle_ids=payload.selected_bundle_ids,
        history=payload.history,
    )

    return ChatResponse(
        answer=answer,
        memory_context=memory_context,
    )
"""

from typing import List, Literal, Optional
from fastapi import APIRouter
from pydantic import BaseModel
from openai import OpenAI, AuthenticationError, APIConnectionError, APIStatusError
import os

router = APIRouter()

# ====== 환경변수에서 키 읽기 ======
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    print("[chat.py] OPENAI_API_KEY detected (length:", len(OPENAI_API_KEY), ")")
    client: Optional[OpenAI] = OpenAI(api_key=OPENAI_API_KEY)
else:
    print("[chat.py] WARNING: OPENAI_API_KEY is NOT set. Using echo mode.")
    client = None


# ====== Pydantic 모델 ======
class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    user_id: str
    message: str
    history: List[ChatHistoryItem] = []
    selected_bundle_ids: Optional[List[str]] = None


class ChatResponse(BaseModel):
    # 프론트에서 기대하는 필드 이름에 맞춰줌
    answer: str
    memory_context: str = ""
    used_memories: list = []


# ====== /chat 엔드포인트 ======
@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest) -> ChatResponse:
    """
    LLM 호출 + 실패 시 echo 모드로 응답.
    절대 500으로 죽지 않게 방어적으로 작성.
    """
    print(f"[chat.py] /chat called. user_id={req.user_id}, message={req.message!r}")

    # 0. 키가 아예 없는 경우 → 에코 모드
    if client is None:
        print("[chat.py] No OpenAI client. Returning echo mode.")
        return ChatResponse(
            answer=f"[NO_API_KEY] echo: {req.message}",
            memory_context="",
            used_memories=[],
        )

    # 1. messages 구성
    messages = [
        {
            "role": "system",
            "content": (
                "You are an assistant that helps the user with their projects. "
                "Answer in Korean by default unless the user uses another language."
            ),
        }
    ]

    # 히스토리 반영
    for h in req.history:
        messages.append({"role": h.role, "content": h.content})

    # 이번 user 메시지
    messages.append({"role": "user", "content": req.message})

    # 2. OpenAI 호출
    try:
        completion = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=messages,
            max_tokens=512,
            temperature=0.7,
        )
        reply_text = completion.choices[0].message.content
        print("[chat.py] OpenAI call success.")
        return ChatResponse(
            answer=reply_text,
            memory_context="",
            used_memories=[],
        )

    # 3. 다양한 에러 케이스 방어
    except AuthenticationError as e:
        # 키가 틀렸거나 권한 문제
        print("[chat.py] AuthenticationError:", repr(e))
        return ChatResponse(
            answer=f"[AUTH_ERROR] API 키 인증 오류로 echo 모드로 응답합니다: {req.message}",
            memory_context="",
            used_memories=[],
        )
    except APIConnectionError as e:
        # 네트워크 문제 (VM → OpenAI)
        print("[chat.py] APIConnectionError:", repr(e))
        return ChatResponse(
            answer=f"[NETWORK_ERROR] OpenAI 서버에 연결할 수 없어 echo 모드로 응답합니다: {req.message}",
            memory_context="",
            used_memories=[],
        )
    except APIStatusError as e:
        # OpenAI 쪽 5xx 등
        print("[chat.py] APIStatusError:", repr(e))
        return ChatResponse(
            answer=f"[OPENAI_STATUS_ERROR] 상태코드={e.status_code}, echo: {req.message}",
            memory_context="",
            used_memories=[],
        )
    except Exception as e:
        # 나머지 예외 → 절대 500으로 죽지 않게
        print("[chat.py] UNKNOWN ERROR:", repr(e))
        return ChatResponse(
            answer=f"[UNKNOWN_ERROR] 서버 내부 오류로 echo 모드로 응답합니다: {req.message}",
            memory_context="",
            used_memories=[],
        )
