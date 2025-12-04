# app/schemas/chat.py
from pydantic import BaseModel
from uuid import UUID
from typing import List, Optional, Dict, Any


class ChatRequest(BaseModel):
    # lib/api.ts 의 sendChat 이 보내는 필드랑 1:1 매칭
    user_id: UUID
    message: str
    selected_bundle_ids: List[UUID] = []
    history: Optional[List[Dict[str, Any]]] = None  # [{"role": "...", "content": "..."}]


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
