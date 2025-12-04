# app/api/chat.py

import json
import logging
import os
from datetime import datetime
from typing import List, Any, Dict, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from openai import OpenAI, AuthenticationError, APIConnectionError, APIStatusError

from app.core.db import get_db
from app.schemas.chat import ChatRequest, ChatResponse
from app.models.memory_item import MemoryItem

logger = logging.getLogger("app.chat")

# -------------------------
# OpenAI 클라이언트 초기화
# -------------------------

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    print(f"[chat.py] OPENAI_API_KEY detected (length: {len(OPENAI_API_KEY)})")
    client: Optional[OpenAI] = OpenAI(api_key=OPENAI_API_KEY)
else:
    print("[chat.py] WARNING: OPENAI_API_KEY is NOT set. Using echo mode.")
    client = None

# -------------------------
# 설정값
# -------------------------

MAX_HISTORY_ITEMS = 10          # 히스토리는 최신 10개만
MAX_MEMORY_ITEMS = 5            # 번들 메모는 최대 5개만 context에 사용
MEMORY_SNIPPET_MAX_LEN = 300    # 메모 한 개당 잘라낼 최대 길이

# -------------------------
# Router
# -------------------------

# main.py에서 app.include_router(chat.router) 하고 있으므로
# prefix 없이 /chat 으로 바로 노출되게 둔다.
router = APIRouter()


def _build_memory_context(memories: List[MemoryItem]) -> str:
    """선택된 번들에서 가져온 메모들로 memory_context 문자열을 만든다."""
    if not memories:
        return ""

    lines: List[str] = [
        "다음은 사용자가 과거에 저장해 둔 중요한 메모들이야.",
        "필요하면 이 정보를 참고해서 현재 질문에 답해 줘."
    ]
    for idx, m in enumerate(memories, start=1):
        text = m.summary or m.original_text or ""
        if len(text) > MEMORY_SNIPPET_MAX_LEN:
            text = text[:MEMORY_SNIPPET_MAX_LEN] + "..."
        title = m.title or f"메모 {idx}"
        lines.append(f"- {title}: {text}")

    return "\n".join(lines)


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    req: ChatRequest,
    db: Session = Depends(get_db),
) -> ChatResponse:
    """
    - 프론트에서 보내준 history 중 마지막 10개만 사용
    - 선택된 번들(selected_bundle_ids)에 들어있는 메모들을 읽어서 memory_context 구성
    - OpenAI에 system + memory_context + history + 현재 user 메시지를 보내서 답변
    - 실패 시에는 에코 모드로라도 항상 200 + ChatResponse 리턴
    """
    # 기본 값 정리
    history_raw: List[Dict[str, Any]] = req.history or []
    if len(history_raw) > MAX_HISTORY_ITEMS:
        history = history_raw[-MAX_HISTORY_ITEMS:]
    else:
        history = history_raw

    logger.info(
        "[CHAT REQUEST] user_id=%s message=%r history_len=%d selected_bundle_ids=%s",
        str(req.user_id),
        req.message,
        len(history),
        [str(b) for b in (req.selected_bundle_ids or [])],
    )

    # -------------------------
    # 1) 선택된 번들에서 메모 가져오기
    # -------------------------
    memories: List[MemoryItem] = []
    if req.selected_bundle_ids:
        try:
            memories = (
                db.query(MemoryItem)
                .filter(
                    MemoryItem.user_id == req.user_id,
                    MemoryItem.bundle_id.in_(req.selected_bundle_ids),
                )
                .order_by(
                    MemoryItem.is_pinned.desc(),
                    MemoryItem.usage_count.desc(),
                    MemoryItem.created_at.desc(),
                )
                .limit(MAX_MEMORY_ITEMS)
                .all()
            )
        except Exception as e:
            logger.error("[chat] error while loading memories: %r", e)
            memories = []

    memory_context = _build_memory_context(memories)

    # -------------------------
    # 2) system + memory_context + history + user message로 messages 구성
    # -------------------------
    system_content = (
        "You are an assistant that helps the user with their projects. "
        "Answer in Korean by default unless the user uses another language.\n"
        "[memory_context]\n"
        f"{memory_context or 'No special memories for this query.'}\n"
        "[/memory_context]\n\n"
        "Guidelines:\n"
        "- Use the information in [memory_context] as helpful background.\n"
        "- If it conflicts with what the user says now, ask for clarification.\n"
        "- If something is not in the memory_context, just answer normally."
    )

    messages: List[Dict[str, str]] = [
        {"role": "system", "content": system_content}
    ]
    for h in history:
        # h는 {"role": "...", "content": "..."} 형태라고 가정
        role = h.get("role", "user")
        content = h.get("content", "")
        if not isinstance(content, str):
            content = str(content)
        messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": req.message})

    # 로깅용 payload
    payload_for_log = {
        "model": "gpt-4.1-mini",
        "messages": messages,
        "max_tokens": 512,
        "temperature": 0.7,
    }
    logger.info("[LLM REQUEST PAYLOAD]\n%s", json.dumps(payload_for_log, ensure_ascii=False, indent=2))

    # -------------------------
    # 3) OpenAI 호출 (키 없으면 에코 모드)
    # -------------------------
    if client is None:
        logger.warning("[chat] No OpenAI client. Returning echo mode.")
        return ChatResponse(
            answer=f"[NO_API_KEY] echo: {req.message}",
            memory_context=memory_context,
        )

    try:
        completion = client.chat.completions.create(**payload_for_log)
        reply_text = completion.choices[0].message.content
        logger.info("[LLM RESPONSE] %r", reply_text)

        # 메모 사용 기록 업데이트 (usage_count, last_used_at)
        if memories:
            try:
                now = datetime.utcnow()
                for m in memories:
                    m.usage_count = (m.usage_count or 0) + 1
                    m.last_used_at = now
                db.commit()
            except Exception as e:
                # 사용 기록 업데이트 실패해도 메인 로직은 깨지지 않게
                logger.error("[chat] failed to update memory usage: %r", e)
                db.rollback()

        return ChatResponse(
            answer=reply_text,
            memory_context=memory_context,
        )

    # -------------------------
    # 4) 각종 에러 → 에코 모드
    # -------------------------
    except AuthenticationError as e:
        logger.error("[chat] AuthenticationError: %r", e)
        return ChatResponse(
            answer=f"[AUTH_ERROR] API 키 인증 오류로 echo 모드로 응답합니다: {req.message}",
            memory_context=memory_context,
        )
    except APIConnectionError as e:
        logger.error("[chat] APIConnectionError: %r", e)
        return ChatResponse(
            answer=f"[NETWORK_ERROR] OpenAI 서버에 연결할 수 없어 echo 모드로 응답합니다: {req.message}",
            memory_context=memory_context,
        )
    except APIStatusError as e:
        logger.error("[chat] APIStatusError: %r", e)
        return ChatResponse(
            answer=f"[OPENAI_STATUS_ERROR] 상태코드={e.status_code}, echo: {req.message}",
            memory_context=memory_context,
        )
    except Exception as e:
        logger.error("[chat] UNKNOWN ERROR: %r", e)
        return ChatResponse(
            answer=f"[UNKNOWN_ERROR] 서버 내부 오류로 echo 모드로 응답합니다: {req.message}",
            memory_context=memory_context,
        )
