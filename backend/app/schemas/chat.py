# app/schemas/chat.py
from uuid import UUID
from typing import List, Optional, Literal

from pydantic import BaseModel


class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    # lib/api.ts 의 sendChat 이 보내는 필드랑 1:1 매칭
    user_id: UUID
    message: str
    selected_bundle_ids: List[UUID] = []
    history: List[ChatHistoryItem] = []  # [{role, content}, ...]


class UsedMemory(BaseModel):
    id: UUID
    bundle_id: UUID
    title: Optional[str] = None
    summary: Optional[str] = None


class ChatResponse(BaseModel):
    # lib/api.ts 의 sendChat 이 읽는 필드랑 1:1 매칭
    answer: str
    memory_context: str
    used_memories: List[UsedMemory] = []
