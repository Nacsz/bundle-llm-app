# app/llm/client.py

import os
from openai import OpenAI

from app.llm.prompts import (
    MEMORY_SUMMARY_SYSTEM_PROMPT,
    make_memory_summary_user_prompt,
    CHAT_SYSTEM_PROMPT,
)

# .env에 있는 OPENAI_API_KEY 사용
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

DEFAULT_CHAT_MODEL = "gpt-4o-mini"  # 원하는 모델 이름으로 변경 가능


def summarize_for_memory(original_text: str) -> str:
    """
    memory_items.summary 생성용 요약 함수
    (openai-python 1.x 스타일)
    """
    completion = client.chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=[
            {"role": "system", "content": MEMORY_SUMMARY_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": make_memory_summary_user_prompt(original_text),
            },
        ],
        temperature=0.2,
        max_tokens=256,
    )

    # 1.x에서는 이렇게 꺼내면 됨
    return completion.choices[0].message.content.strip()


def chat_with_memory(
    memory_context: str,
    user_message: str,
    history: list[dict] | None = None,
) -> str:
    """
    메모리 컨텍스트 + 현재 질문으로 LLM 호출
    (openai-python 1.x 스타일)
    """
    messages: list[dict] = [
        {"role": "system", "content": CHAT_SYSTEM_PROMPT},
        {
            "role": "system",
            "content": (
                f"[MEMORY CONTEXT]\n{memory_context}"
                if memory_context
                else "[MEMORY CONTEXT]\n(선택된 번들에서 불러온 메모 없음)"
            ),
        },
    ]

    if history:
        # history는 이미 [{"role": "...", "content": "..."}] 형태라고 가정
        messages.extend(history)

    messages.append({"role": "user", "content": user_message})

    completion = client.chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=messages,
        temperature=0.7,
        max_tokens=1024,
    )

    return completion.choices[0].message.content.strip()
