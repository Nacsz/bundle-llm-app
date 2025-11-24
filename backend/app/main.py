# app/main.py
from fastapi import FastAPI
from app.api import bundles, chat
from fastapi.middleware.cors import CORSMiddleware
# 🔥 이 줄이 중요: 모델들을 import해서 Base.metadata에 등록
from app import models  # noqa: F401  (안 쓴다고 경고 나와도 신경 안 써도 됨)
from app.core.db import init_db

app = FastAPI(
    title="Bundle-based LLM Memory API",
    version="0.1.0",
)

# db 컨테이너 생성
@app.on_event("startup")
def on_startup():
    init_db()

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # 나중에 배포하면 여기에 프론트 실제 도메인도 추가
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,        # 어떤 프론트 주소를 허용할지
    allow_credentials=True,
    allow_methods=["*"],          # 모든 HTTP method 허용 (GET, POST, OPTIONS ...)
    allow_headers=["*"],          # 모든 헤더 허용
)
app.include_router(bundles.router)
app.include_router(chat.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}

