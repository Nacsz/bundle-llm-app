# backend/app/schemas/token.py

from pydantic import BaseModel

from app.schemas.user import UserOut


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
