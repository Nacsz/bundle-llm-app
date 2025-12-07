# Bundle-based LLM Memory App

> **“대화 내용을 번들(bundle) 단위로 정리해서, LLM에 필요한 기억만 골라 넣는 개인용 메모 + 챗봇 시스템”**

FastAPI + PostgreSQL(pgvector) + Next.js로 만든 **장기 기억 지원 LLM UI** 입니다.  
사용자는 “번들(Bundle)”을 폴더처럼 만들어서 기억을 정리하고,  
채팅할 때 **어떤 기억을 LLM에게 보여줄지 직접 선택**할 수 있습니다.


---

##  핵심 기능 (Features)

### 1. 번들 기반 장기 기억 (Bundles & Memories)

- **Bundle**: 폴더처럼 쓰는 “기억 묶음”
  - 트리 구조 (상위 번들 / 하위 번들)
  - 색상, 아이콘, 설명 설정 가능
- **Memory Item**: 번들 안에 들어가는 실제 메모
  - `original_text`: 원문 내용
  - `summary`: LLM이 만들어준 요약 (선택)
  - `metadata`: 출처 등 추가 정보(JSON)

### 2. LLM 채팅 + 메모 선택 주입

- 오른쪽 패널에서 일반 채팅 UI 제공
- 왼쪽 번들 패널에서 **메모를 체크박스/트리로 선택**
- 선택된 메모들은 `memory_context` 로 LLM system 프롬프트에 주입
- 사용자는 “이번 질문에 어떤 기억을 참고할지”를 매 턴 직접 컨트롤

### 3. 자동 메모 저장 (Auto Save from Chat)

- 옵션: **“자동 메모 저장 (현재 번들)”** 체크 시
  - 유저 메시지 + LLM 답변 한 턴을 하나의 텍스트로 합쳐서
  - 현재 선택된 번들에 자동으로 MemoryItem 생성
  - 제목은 사용자 입력 내용에서 적당히 잘라서 사용

### 4. 자동 분류 & 번들 생성 (Auto Routing)

- `/chat` 엔드포인트에서:
  1. `사용자 메시지 + LLM 답변` → LLM으로 간단 요약 + 키워드 추출
  2. 기존 번들들의 `name/description` 과 키워드 문자열 매칭
  3. 가장 잘 맞는 번들을 선택, 없으면 **새 번들 자동 생성**
  4. 해당 번들에 MemoryItem 저장
- 이렇게 쌓이는 메모들은 나중에 번들 트리에서 다시 정리할 수 있습니다.

### 5. 번들 자동 정리 (Auto Grouping by LLM)

- 상단 **“정리하기”** 버튼:
  1. 현재 유저의 번들 목록(제목/설명)만 LLM에 보내서
  2. “상위 카테고리 → 하위 번들들” 구조로 묶을 후보 생성 (preview)
  3. 프론트에서 **“정리 미리보기”**로 어떤 상위 번들이 생길지 보여줌
  4. 사용자가 `이렇게 정리하시겠습니까?` 를 눌러 확인하면
     - 백엔드가 실제로 새 상위 번들을 만들고
     - 하위 번들의 `parent_id` 를 묶어서 트리 구조로 재배치


### 6. 번들 / 메모 트리 UI

- **번들 트리**
  - 상위 번들을 클릭해 접기/펼치기
  - 체크하면 **해당 번들 + 모든 하위 번들의 메모를 한꺼번에 선택**
  - 상단의 **“전체 선택/해제”** 버튼으로 모든 메모 토글
- **메모 이동**
  - 메모 카드를 다른 번들 줄로 **드래그 & 드롭**해서 이동
  - (필요 시 메모 카드의 별도 “이동” 버튼을 통해서도 이동 가능)
- 번들/메모 수정 및 삭제 지원

---

##  기술 스택 (Tech Stack)

### Backend

- **FastAPI**
- **PostgreSQL + pgvector**
  - 향후 유사도 검색을 위한 벡터 컬럼 준비
- SQLAlchemy ORM
- JWT 인증
  - `/auth/register`, `/auth/login`, `/auth/me`
  - 모든 번들/메모는 `current_user` 기준으로 격리
- 주요 엔드포인트
  - `POST /chat` – LLM 대화 + 자동 요약/분류
  - `GET /bundles/` – 번들 목록 조회
  - `POST /bundles/` – 번들 생성
  - `GET /bundles/{bundle_id}/memories` – 특정 번들의 메모 목록
  - `POST /bundles/{bundle_id}/memories` – 메모 저장
  - `POST /bundles/auto-group/preview` – 번들 자동 정리 미리보기
  - `POST /bundles/auto-group/apply` – 번들 자동 정리 적용

### Frontend

- **Next.js (App Router) + React**
- Tailwind CSS 기반 간단한 UI
- 주요 컴포넌트
  - `BundlePanel`
    - 번들/메모 트리 UI
    - 드래그&드롭 이동, 전체 선택/해제, 번들 자동 정리 트리거
  - `ChatWindow`
    - 메인 LLM 채팅 UI
  - `SaveMemoryPanel`
    - 현재 채팅 10턴 묶어서 메모로 저장하는 패널
- API 모듈: `frontend/lib/api.ts`
  - `NEXT_PUBLIC_API_BASE` 환경 변수로 백엔드 주소 연동
  - JWT 토큰을 `localStorage` 에 저장/전달

### LLM API

- OpenAI `gpt-4.1-mini` (변경 가능)
- 사용 용도
  - `/chat`: 실제 사용자 질문에 대한 답변
  - `summarize_for_memory`: 메모용 요약 생성
  - `summarize_and_extract_keywords`: 자동 분류용 요약 + 키워드
  - `auto-group`: 번들 제목/설명 기반 카테고리 묶기

---

##  인프라 / 서버 구축

이 프로젝트는 **집에 있는 물리 서버 위에 직접 OpenStack 프라이빗 클라우드**를 올린 뒤,  
그 위의 VM에서 Docker로 서비스를 돌리는 구조로 운영하고 있습니다.

### 1. 물리 서버 (Home Lab)

- CPU: Intel i5-6600
- RAM: 16GB
- GPU: GTX 1060 3GB (LLM 실험용)
- OS: Ubuntu Server 계열
- 용도: OpenStack all-in-one 노드 + 스토리지

집 공유기에서 이 서버로 **포트포워딩(80/443)** 을 걸어두고,  
도메인 `nacsiz.xyz` 를 이 서버 공인 IP에 물려서 외부에서도 접속할 수 있게 했습니다.

### 2. OpenStack 프라이빗 클라우드

- OpenStack (devstack 기반 싱글 노드)
- 프로젝트/유저를 분리해서 “나만의 작은 클라우드”처럼 사용
- 이 앱을 위해 **전용 VM 하나**를 생성해서 배포

예시 VM 스펙:

- 이름: `bundle-llm-vm`
- vCPU: 2
- RAM: 4GB
- Disk: 50GB (루트 디스크)
- OS: Ubuntu 22.04 LTS

### 3. 애플리케이션 VM 내부 구조

VM 안에서는 **Docker + docker-compose** 로 서비스를 올립니다.

- `llm-backend` : FastAPI + PostgreSQL(pgvector)와 연결되는 LLM 백엔드
- `llm-frontend`: Next.js 기반 프론트엔드
- `db`          : PostgreSQL (pgvector 확장 포함)
- (옵션) `pgadmin` 등 관리용 툴

전체 흐름은 대략 다음과 같습니다.

```mermaid
flowchart LR
  User[브라우저\nhttps://nacsiz.xyz] -->|443| VM[OpenStack VM\nbundle-llm-vm]
  VM --> FE[Next.js 프론트엔드 컨테이너]
  FE --> BE[FastAPI 백엔드 컨테이너]
  BE --> DB[(PostgreSQL\n+ pgvector)]
프론트엔드는 /api 요청을 백엔드 컨테이너로 프록시

백엔드는 JWT 인증을 통해 유저별로 번들과 메모를 분리

DB는 모든 번들/메모/유저 정보를 저장하고,
향후 임베딩 기반 검색을 위해 pgvector 컬럼을 미리 준비해둔 상태입니다.

### 4. 현재 상태와 향후 계획
현재 :

OpenStack 위 단일 VM에서 docker-compose로 앱 구동

도메인 + HTTPS 까지 구성해서 외부 접속 가능

향후 계획 :

OpenStack 클러스터 위에 Kubernetes 올리기

이 앱을 K8s Deployment/Service/Ingress 구조로 이관

Jenkins + ArgoCD를 붙여서

Git push → Jenkins가 Docker 이미지 빌드 → 레지스트리에 push

ArgoCD가 GitOps 방식으로 K8s 리소스 자동 Sync

정리하면, 이 프로젝트는 단순히 “LLM 메모 앱”이 아니라
집 서버 + OpenStack + Docker(+나중엔 K8s) 를 모두 관통하는
개인용 풀스택/인프라 실습 프로젝트입니다.

## 🔒 보안 / API Key 처리 방식

이 프로젝트는 **OpenAI API 키**를 두 가지 방식으로 사용합니다.

1. **서버 공용 키 (환경 변수 `OPENAI_API_KEY`)**
   - 서버에서만 사용하는 OpenAI 키입니다.
   - Docker / 서버 OS의 **환경 변수**로만 설정하며, 깃 레포지토리에는 절대 커밋되지 않습니다.
   - 이 키는 사용자가 직접 접근할 수 없고, 프론트엔드로도 절대 전송되지 않습니다.
   - 평가용 모드에서만, 특정 비밀번호(`SHARED_API_PASSWORD`)를 아는 사용자의 요청에 한해
     백엔드 내부에서 간접적으로 사용됩니다.

2. **사용자 개인 OpenAI API 키**
   - 일반 사용자는 **자신의 OpenAI API 키를 입력**해서 사용합니다.
   - 이 키는 브라우저(로컬)에서만 보관되며, 데이터베이스나 서버 디스크에 저장하지 않습니다.
   - 요청 시 헤더(예: `X-OpenAI-Api-Key`)로만 전송되고, 백엔드는 이 키로 OpenAI 클라이언트를 생성한 뒤
     즉시 사용을 종료합니다.
   - 서버 로그에 API 키 전체가 남지 않도록 주의해서 구현했습니다.

3. **교수님/평가용 특별 비밀번호 (`SHARED_API_PASSWORD`)**
   - 수업/평가용으로, 특정 비밀번호를 알고 있는 경우에만 서버 공용 키를 대신 사용하도록 했습니다.
   - 이 비밀번호는 환경 변수로만 설정되며, 코드/레포지토리에 노출되지 않습니다.
   - 외부 공개 후에는 비밀번호를 변경하거나, 필요 시 이 기능을 비활성화할 수 있습니다.

4. **통신 보안**
   - 서비스는 `https://<도메인>`(예: `https://nacsiz.xyz`)에서 동작하며,
     모든 API 요청은 HTTPS를 통해 암호화된 채널로 전송됩니다.
   - CORS 정책은 실제 배포 도메인으로만 제한하여, 임의의 외부 사이트에서
     사용자의 API 키를 악용하지 못하도록 하고 있습니다.

> 요약: **서버 공용 키는 환경 변수로만 관리**, **사용자 키는 서버에 저장하지 않고 요청당 1회만 사용**,  
> **평가용 비밀번호는 제한된 사람만 사용**하도록 설계되어 있습니다.

##  도메인 개념 (Domain Model)

### User

- `id`, `email`, `username`, `hashed_password`, `is_active` 등
- JWT 토큰 기반 인증

### Bundle

- `id`, `user_id`
- `parent_id` (상위 번들)
- `name`, `description`
- `color`, `icon`
- `is_archived`
- 관계:
  - `children`: 하위 번들들
  - `memories`: 이 번들에 속한 MemoryItem 리스트

### MemoryItem

- `id`, `user_id`, `bundle_id`
- `title`
- `original_text`
- `summary` (optional, LLM 요약)
- `source_type`, `source_id`
- `metadata_json` (JSON)
- `is_pinned`, `usage_count`, `last_used_at`

---

## 실행 (개략적인 안내)

> **주의:** 실제 실행 방법은 프로젝트 구조/스크립트에 따라 다를 수 있습니다.  
> 아래는 일반적인 예시 흐름입니다.

### 1. 환경 변수

백엔드(.env 예시):

```env
DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/bundle_llm
OPENAI_API_KEY=sk-...
JWT_SECRET_KEY=your-secret
JWT_ALGORITHM=HS256


프론트엔드(.env.local 예시):

NEXT_PUBLIC_API_BASE=http://localhost:8000

### 2. Backend
cd backend
# 가상환경 등 준비 후
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

### 3. Frontend
cd frontend
npm install
npm run dev
# http://localhost:3000 접속

## 사용 흐름 (User Flow)

### 회원가입 / 로그인

이메일 + 비밀번호로 계정 생성 → 로그인

### 번들 만들기

왼쪽 패널 하단에서 새 번들 만들기

필요하다면 “국가 / 음식 / 프로젝트 / 공부”처럼 트리 구조 설계

### 메모 기록

채팅 내용 일부를 왼쪽 “메모 저장” 패널로 복사해 저장

또는 자동 메모 저장 옵션을 켜고 채팅하기

### 기억 선택 후 채팅

번들 체크박스 / 메모 체크박스로 “이번 대화에 참조할 기억” 선택

오른쪽 채팅창에서 질문 → memory_context가 system 프롬프트에 포함

### 번들 자동 정리

번들 목록이 많아졌다면 상단 “정리하기” 버튼으로

LLM이 제안하는 상위 번들 구조를 확인 후 적용 클릭

## 목표

“LLM이 대화를 다 잊어버린다”는 문제를 피하기 위해,

사용자가 직접 기억을 관리하고

필요할 때만 LLM에게 기억을 선택해서 보여주게 하는 실험용 앱

나아가, 프라이빗 클라우드(OpenStack/Kubernetes) 위에서

자기만의 LLM 메모리 시스템을 운영해보는 것이 궁극적인 목표입니다.
