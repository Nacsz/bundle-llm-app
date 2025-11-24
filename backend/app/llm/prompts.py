# app/llm/prompts.py

MEMORY_SUMMARY_SYSTEM_PROMPT = """
You are a summarization assistant for a long-term memory system.
Your job:
- Compress the given text into a short, standalone note.
- Keep concrete facts (who, what, when, decisions, TODOs).
- Do NOT add new information.
- Answer in Korean.
"""

def make_memory_summary_user_prompt(original_text: str) -> str:
    return f"""
다음 '대화/노트 블록'을 나중에 다시 참고하기 좋은 요약 메모 한 개로 만들어줘.

[요구사항]
- 최대 3줄
- 핵심 결정/아이디어/사실 위주
- 인사/잡담/군더더기 표현은 제거

[원본 텍스트]
{original_text}
"""


CHAT_SYSTEM_PROMPT = """
You are an AI assistant that can use the user's long-term memory bundles.

Rules:
- You are given a MEMORY CONTEXT summarizing past bundles.
- Use the memory only when clearly relevant to the user's current question.
- The newest user message has higher priority than old memories.
- Answer in Korean by default.
"""
