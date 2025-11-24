# app/schemas/chat.py
from pydantic import BaseModel
from uuid import UUID
from typing import List, Optional, Dict, Any

class ChatRequest(BaseModel):
    user_id: UUID
    message: str
    selected_bundle_ids: List[UUID] = []
    history: Optional[List[Dict[str, Any]]] = None  # [{"role": "...", "content": "..."}]

class ChatResponse(BaseModel):
    answer: str
    memory_context: str  # 실제로 LLM에 붙인 문자열 (디버깅/튜닝용)
