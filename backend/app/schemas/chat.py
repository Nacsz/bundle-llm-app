# app/schemas/chat.py
from uuid import UUID
from typing import List, Optional, Literal

from pydantic import BaseModel, Field


class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    # 프론트에서 아직 user_id를 보내고 있으니 optional로 받아만 두고, 실제 로직은 토큰 user_id 사용
    user_id: Optional[UUID] = None

    # lib/api.ts 의 sendChat 이 보내는 필드랑 1:1 매칭
    message: str
    history: List[ChatHistoryItem] = Field(default_factory=list)
    selected_bundle_ids: List[UUID] = Field(default_factory=list)
    # ✅ 선택한 메모 id들
    selected_memory_ids: List[UUID] = Field(default_factory=list)


class UsedMemoryItem(BaseModel):
    id: str
    bundle_id: str
    title: Optional[str] = None


class ChatResponse(BaseModel):
    # lib/api.ts 의 sendChat 이 읽는 필드랑 1:1 매칭
    answer: str
    memory_context: str = ""
    used_memories: List[UsedMemoryItem] = Field(default_factory=list)
