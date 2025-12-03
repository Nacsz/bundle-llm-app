# app/main.py
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api import bundles, chat
from app.core.db import init_db, Base, engine
from app import models  # noqa: F401  # Base.metadata에 모델 등록용

app = FastAPI(
    title="Bundle-based LLM Memory API",
    version="0.1.0",
)


@app.on_event("startup")
def on_startup() -> None:
    # DB 초기화 및 테이블 생성
    init_db()
    Base.metadata.create_all(bind=engine)


# CORS 설정
# 필요하면 여기 origins를 특정 도메인으로 좁혀도 됨
origins = [
    "*",  # 개발 단계에서는 전체 허용
    # "http://localhost",
    # "http://localhost:3000",
    # "http://172.24.4.113",
    # "http://172.24.4.113:80",
    # "http://172.24.4.113:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],   # ← OPTIONS, POST, GET 전부 허용
    allow_headers=["*"],   # ← Content-Type 등 전부 허용
)


# /chat 프리플라이트(OPTIONS) 전용 엔드포인트
@app.options("/chat", include_in_schema=False)
async def options_chat() -> Response:
    # 프리플라이트 요청은 바디 없이 200만 주면 됨
    return Response(status_code=200)


# 라우터 등록
app.include_router(bundles.router)
app.include_router(chat.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
