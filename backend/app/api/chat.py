# app/api/chat.py
import os
import json
import logging
from typing import List, Literal, Optional, Tuple
import uuid

from fastapi import APIRouter
from pydantic import BaseModel, Field
from openai import OpenAI, AuthenticationError, APIConnectionError, APIStatusError

from app.core.db import SessionLocal
from app import models  # MemoryItem, Bundle 등

logger = logging.getLogger("app.chat")

# ----- FastAPI Router -----
router = APIRouter()

# ----- OpenAI 클라이언트 준비 -----
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    logger.info(
        "[chat.py] OPENAI_API_KEY detected (length=%d)", len(OPENAI_API_KEY)
    )
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
  user_id: uuid.UUID
  message: str
  history: List[ChatHistoryItem] = Field(default_factory=list)
  # 기존: 번들 선택
  selected_bundle_ids: List[uuid.UUID] = Field(default_factory=list)
  # 새 필드: 프론트에서 체크한 메모 id들
  selected_memory_ids: List[uuid.UUID] = Field(default_factory=list)


class UsedMemoryItem(BaseModel):
  id: str
  bundle_id: str
  title: Optional[str] = None


class ChatResponse(BaseModel):
  # 프론트에서 기대하는 필드 이름에 맞춰줌 (지금은 answer 사용 중)
  answer: str
  memory_context: str = ""
  used_memories: List[UsedMemoryItem] = Field(default_factory=list)


# ----- helper: 메모 → memory_context 생성 -----
def build_memory_context(
  user_id: uuid.UUID,
  bundle_ids: Optional[List[uuid.UUID]],
  selected_memory_ids: Optional[List[uuid.UUID]],
) -> Tuple[str, List[UsedMemoryItem]]:
  """
  selected_memory_ids가 비어있지 않으면 그 메모들만 사용.
  비어 있으면 bundle_ids 기준으로 기존 동작 유지.
  """
  db = SessionLocal()
  try:
    q = db.query(models.MemoryItem).filter(models.MemoryItem.user_id == user_id)

    if selected_memory_ids:
      # � 체크한 메모만 사용
      q = q.filter(models.MemoryItem.id.in_(selected_memory_ids))
    elif bundle_ids:
      # 예전 방식: 번들 전체
      q = q.filter(models.MemoryItem.bundle_id.in_(bundle_ids))
    else:
      # 아무것도 선택 안 했으면 memory_context 없음
      return "", []

    q = q.order_by(models.MemoryItem.created_at.desc()).limit(MAX_MEMORY_ITEMS)
    rows = q.all()

    if not rows:
      return "", []

    lines: List[str] = []
    used: List[UsedMemoryItem] = []

    for m in rows:
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
  logger.info(
    "[CHAT REQUEST] user_id=%s message=%r history_len=%d selected_bundle_ids=%s selected_memory_ids=%s",
    req.user_id,
    req.message,
    len(req.history),
    req.selected_bundle_ids,
    req.selected_memory_ids,
  )

  # API KEY 없으면 echo 모드
  if client is None:
    logger.warning("[chat.py] No OpenAI client. Returning echo mode.")
    return ChatResponse(
      answer=f"[NO_API_KEY] echo: {req.message}",
      memory_context="",
      used_memories=[],
    )

  # history 슬라이싱
  if len(req.history) > MAX_HISTORY:
    history_for_llm = req.history[-MAX_HISTORY:]
  else:
    history_for_llm = req.history

  logger.info(
    "[CHAT] using history_len=%d (original=%d)",
    len(history_for_llm),
    len(req.history),
  )

  # memory_context 구성
  memory_context_text, used_memories = build_memory_context(
    user_id=req.user_id,
    bundle_ids=req.selected_bundle_ids,
    selected_memory_ids=req.selected_memory_ids,
  )

  # system 프롬프트
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

  # 디버그용 payload 로그
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
    pass

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
