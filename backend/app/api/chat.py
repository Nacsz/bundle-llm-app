# app/api/chat.py
import os
import json
import logging
from typing import List, Literal, Optional, Tuple
import uuid

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field
from openai import OpenAI, AuthenticationError, APIConnectionError, APIStatusError

from app.core.db import SessionLocal
from app import models  # MemoryItem, Bundle 등

logger = logging.getLogger("app.chat")

# ----- FastAPI Router -----
router = APIRouter()

# ----- OpenAI 관련 환경 변수 -----
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or ""
SHARED_API_PASSWORD = os.getenv("SHARED_API_PASSWORD") or ""

if OPENAI_API_KEY:
  logger.info("[chat.py] OPENAI_API_KEY is set (server shared key 가능).")
else:
  logger.warning("[chat.py] OPENAI_API_KEY is not set. Server shared key 사용 불가.")

if SHARED_API_PASSWORD:
  logger.info("[chat.py] SHARED_API_PASSWORD is set (평가용 모드).")
else:
  logger.warning("[chat.py] SHARED_API_PASSWORD is not set. shared password 기능 비활성화.")

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
# =========================
#  OpenAI 클라이언트 생성 헬퍼
# =========================
def build_openai_client(
    user_api_key: Optional[str],
    shared_api_password: Optional[str],
) -> Optional[OpenAI]:
    """
    우선순위:
    1) user_api_key (개인 키)
    2) shared_api_password == SHARED_API_PASSWORD 인 경우 서버 OPENAI_API_KEY
    둘 다 없으면 None (echo 모드)
    """
    # 1) 사용자 개인 키
    if user_api_key:
        try:
            return OpenAI(api_key=user_api_key)
        except Exception as e:
            logger.warning("[chat.py] invalid user OpenAI key: %r", e)

    # 2) 평가용 비밀번호 → 서버 공용 키 사용
    if (
        shared_api_password
        and SHARED_API_PASSWORD
        and shared_api_password == SHARED_API_PASSWORD
        and OPENAI_API_KEY
    ):
        try:
            logger.info("[chat.py] using SERVER shared OPENAI_API_KEY via password.")
            return OpenAI(api_key=OPENAI_API_KEY)
        except Exception as e:
            logger.warning("[chat.py] failed to build shared OpenAI client: %r", e)

    # 3) 둘 다 실패 → None
    return None


# =========================
#  helper: memory_context
# =========================
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
            # ✅ 체크한 메모만 사용
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


# =========================
#  helper: 요약 + 키워드
# =========================
def summarize_and_extract_keywords(
    user_message: str,
    answer: str,
    client: Optional[OpenAI],
) -> Tuple[str, List[str]]:
    """
    채팅 1턴(사용자 메시지 + LLM 답변)을 요약하고 키워드 리스트를 뽑는다.
    너무 정교하지 않아도 되는 1차 버전.
    """
    # API KEY 없으면 대충 짧게 자르기
    if client is None:
        combined = f"사용자: {user_message}\n\nLLM: {answer}"
        summary = combined[:200]
        return summary, []
    ...
    # 나머지 로직은 그대로, client 사용
    try:
        resp = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {
                    "role": "system",
                    "content": "당신은 대화 내용을 요약하고 키워드를 추출하는 도우미입니다.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=256,
            temperature=0.2,
        )

        content = resp.choices[0].message.content or ""
        data = json.loads(content)

        summary = str(data.get("summary", "")).strip()
        keywords_raw = data.get("keywords", []) or []
        keywords = [str(k).strip() for k in keywords_raw if str(k).strip()]

        # 안전장치
        if not summary:
            summary = (f"사용자: {user_message}\nLLM: {answer}")[:200]

        return summary, keywords
    except Exception as e:
        logger.warning(
            "[chat.py] summarize_and_extract_keywords failed: %r", e
        )
        combined = f"사용자: {user_message}\n\nLLM: {answer}"
        return combined[:200], []


# =========================
#  helper: 번들 선택/생성
# =========================
def pick_or_create_bundle_for_chat(
    user_id: uuid.UUID,
    summary: str,
    keywords: List[str],
) -> models.Bundle:
    """
    1) 유저의 번들들 중에서 키워드와 가장 잘 맞는 번들 고름
    2) 없으면 새 번들 생성
    (간단 문자열 매칭 버전)
    """
    db = SessionLocal()
    try:
        bundles: List[models.Bundle] = (
            db.query(models.Bundle)
            .filter(models.Bundle.user_id == user_id, models.Bundle.is_archived == False)  # noqa: E712
            .all()
        )

        # 번들이 하나도 없으면 무조건 새로 생성
        def _make_new_bundle() -> models.Bundle:
            base_name = ""
            if keywords:
                base_name = keywords[0]
            if not base_name:
                base_name = summary[:20] or "자동 생성 번들"

            new_bundle = models.Bundle(
                user_id=user_id,
                name=base_name,
                description="자동 생성 (요약/키워드 기반)",
                color="#4F46E5",
                icon="📁",
            )
            db.add(new_bundle)
            db.commit()
            db.refresh(new_bundle)
            return new_bundle

        if not bundles:
            return _make_new_bundle()

        lower_keywords = [k.lower() for k in keywords if k]
        best_bundle: Optional[models.Bundle] = None
        best_score = 0

        for b in bundles:
            text = ((b.name or "") + " " + (b.description or "")).lower()
            score = 0
            for kw in lower_keywords:
                if kw and kw in text:
                    score += 1

            if score > best_score:
                best_score = score
                best_bundle = b

        # 점수가 0이면 "관련 번들 없음"으로 보고 새로 생성
        if best_bundle is None or best_score == 0:
            return _make_new_bundle()

        return best_bundle

    finally:
        db.close()


# =========================
#  helper: 자동 분류+저장
# =========================
def auto_route_and_save_chat_memory(
    user_id: uuid.UUID,
    user_message: str,
    llm_answer: str,
    client: Optional[OpenAI],
) -> Optional[models.MemoryItem]:
    """
    1) 요약 + 키워드 추출
    2) 적절한 번들 선택 또는 새 번들 생성
    3) 해당 번들에 MemoryItem 생성

    실패해도 전체 /chat 흐름은 깨지지 않도록 예외는 위로 안 올림.
    """
    db = SessionLocal()
    try:
        summary, keywords = summarize_and_extract_keywords(user_message, llm_answer, client)
        bundle = pick_or_create_bundle_for_chat(user_id, summary, keywords)

        original_text = f"사용자: {user_message}\n\nLLM: {llm_answer}"

        # ---- 제목을 키워드 기반으로 만들기 ----
        if keywords:
            # 키워드 3~4개 정도를 "/"로 이어 붙이기
            title = " / ".join(keywords[:4])
        elif summary:
            title = summary[:50]
        else:
            title = "자동 요약 메모"

        mem = models.MemoryItem(
            user_id=user_id,
            bundle_id=bundle.id,
            title=title,
            original_text=original_text,
            summary=summary,
            source_type="auto_chat",  # 필요시 enums 맞게 수정
            source_id=None,
            metadata_json={
                "auto_routed": True,
                "keywords": keywords,
            },
        )
        db.add(mem)
        db.commit()
        db.refresh(mem)

        logger.info(
            "[auto_route] saved memory id=%s into bundle id=%s (name=%s)",
            mem.id,
            bundle.id,
            bundle.name,
        )
        return mem
    except Exception as e:
        logger.exception("[chat.py] auto_route_and_save_chat_memory error: %r", e)
        return None
    finally:
        db.close()


# =========================
#         /chat
# =========================
@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    req: ChatRequest,
    x_openai_key: Optional[str] = Header(None),
    x_shared_api_password: Optional[str] = Header(None),
) -> ChatResponse:
    logger.info(
        "[CHAT REQUEST] user_id=%s message=%r history_len=%d "
        "selected_bundle_ids=%s selected_memory_ids=%s",
        req.user_id,
        req.message,
        len(req.history),
        req.selected_bundle_ids,
        req.selected_memory_ids,
    )

    # 요청마다 적절한 OpenAI 클라이언트 생성
    client = build_openai_client(x_openai_key, x_shared_api_password)

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

    # memory_context 구성 (체크된 메모 기반)
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

    messages = [{"role": "system", "content": system_content}]
    for h in history_for_llm:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": req.message})

    # � OpenAI 클라이언트가 없으면 echo 모드
    if client is None:
        logger.warning("[chat.py] No OpenAI client for this request. Echo mode.")
        reply_text = f"[NO_API_KEY] echo: {req.message}"
        return ChatResponse(
            answer=reply_text,
            memory_context=memory_context_text,
            used_memories=used_memories,
        )

    # 디버그용 payload 로그 (내용은 그대로)
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
        reply_text = completion.choices[0].message.content or ""
        logger.info("[LLM RESPONSE] %r", reply_text)

        # ✅ 자동 분류 + 저장 (동일 client 사용)
        try:
            auto_route_and_save_chat_memory(
                user_id=req.user_id,
                user_message=req.message,
                llm_answer=reply_text,
                client=client,
            )
        except Exception as e:
            logger.warning("[chat.py] auto_route failed (ignored): %r", e)

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
