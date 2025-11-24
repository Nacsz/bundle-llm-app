# app/core/db.py

import os
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from dotenv import load_dotenv

# .env 읽기
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # 최소한 에러라도 분명하게 내자
    raise RuntimeError("DATABASE_URL 환경변수가 설정되지 않았습니다 (.env 확인).")

# SQLAlchemy 엔진 생성
engine = create_engine(
    DATABASE_URL,
    echo=True,      # 처음에는 SQL 로그 보려고 True, 나중에 시끄러우면 False
    future=True,
)

# 세션 팩토리
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# Base 클래스 (모든 모델이 이걸 상속)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI Depends(...)에서 쓰는 DB 세션 의존성.
    예: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# 컨테이너화에 의한 새로운 db생성 로직
def init_db():
    # 반드시 models 를 import 해서 Base.metadata 에 테이블들이 등록되게 해줘야 함
    from app import models  # or from app.models import *  (네 구조에 맞게)
    Base.metadata.create_all(bind=engine)