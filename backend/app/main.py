# app/main.py
"""
from fastapi import FastAPI
from app.api import bundles, chat
from fastapi.middleware.cors import CORSMiddleware
# 🔥 이 줄이 중요: 모델들을 import해서 Base.metadata에 등록
from app import models  # noqa: F401  (안 쓴다고 경고 나와도 신경 안 써도 됨)
from app.core.db import init_db ,Base, engine

app = FastAPI(
    title="Bundle-based LLM Memory API",
    version="0.1.0",
)

# db 컨테이너 생성
@app.on_event("startup")
def on_startup():
    init_db()

origins = [
    "*",
    "http://localhost",
    "http://localhost:3000",
    "http://172.24.4.113",        # 호스트에서 접속하는 주소
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
"""


#app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import bundles, chat
from app.core.db import init_db, Base, engine
from app import models  # noqa: F401  # Base.metadata에 모델 등록용

app = FastAPI(
    title="Bundle-based LLM Memory API",
    version="0.1.0",
)

@app.options("/chat")
async def chat_options():
    # CORS preflight용 더미 엔드포인트
    return JSONResponse(
        status_code=200,
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


@app.on_event("startup")
def on_startup():
    # DB 테이블 생성
    init_db()
    Base.metadata.create_all(bind=engine)



origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=[""],
    allow_headers=[""],
)


app.include_router(bundles.router)
app.include_router(chat.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
