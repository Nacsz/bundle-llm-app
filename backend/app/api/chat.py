# app/api/chat.py

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
