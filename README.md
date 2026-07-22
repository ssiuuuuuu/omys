# OMYS — 오늘의 미스터리 스팟

OMYS는 친구나 연인이 후보 또는 조건을 입력하면 실제 방문 가능한 장소 하나를 서버에서 선정하고, 도착할 때까지 목적지를 숨겨 주는 모바일 웹 MVP입니다. 회원가입 없이 닉네임과 추측하기 어려운 초대 코드만으로 참여합니다.

## 구현 범위

- 친구 모드: 방 생성, 초대 링크, 익명 참여, 참가자별 비밀 후보, 완료 현황, 서버 추첨, 당첨 후보 제출자 전용 가이드, 출발 전 1회 재추첨
- OMYS 모드: 이동 수단·시간·예산·카테고리·실내외·제외 활동·음식·총시간 조건 기반 후보 필터와 무작위 선정
- 할 거 없을 때: 로그인·방·위치 입력 없이 느낌별 활동 서버 추첨, 타이머, 결과 기록, 공유, 새로고침 복구
- 공통: 2.5초 polling, 선정 결과 DB 잠금, 출발/이동/도착 상태, GPS 반경 공개, 방장 수동 공개, 공개 전 공유 링크 보호, 공개 결과 공유
- 장소: Google Places API (New) 서버 연동과 API 키가 없는 개발 환경용 mock provider
- 영업 검증: 최종 선정 직전 `businessStatus`, `openNow`, `nextCloseTime` 재조회, 예상 이동+최소 체류시간 검증, 영업정보 미확인 장소 제외, 공공 야외 공간 예외
- 보안: 참가자 토큰, 후보 소유권 필터, 서버 추첨, 중복 선정 고유 제약/트랜잭션, 입력 길이 제한·HTML 이스케이프, CORS, 간단한 IP rate limit
- 익명 분석: 장소 퍼널과 활동 상태 이벤트 저장, 관리자 집계 API

## 미스터리 활동 API

- `GET /api/activities`: 느낌별 활성 활동 목록
- `POST /api/activity-sessions`: 익명 활동 세션 생성
- `GET /api/activity-sessions/{session_id}`: 진행 상태 복구
- `POST /api/activity-sessions/{session_id}/draw`: 느낌별 활동 추첨
- `POST /api/activity-sessions/{session_id}/skip`: 현재 활동을 넘기고 재추첨
- `POST /api/activity-sessions/{session_id}/start`: 활동 시작 시각 저장
- `POST /api/activity-sessions/{session_id}/complete`: 성공·실패·중단 결과 저장

세션 생성 응답의 `session_token`은 최초 한 번만 제공됩니다. 이후 세션 조회와 변경 요청에는
`X-Session-Token` 헤더로 이 값을 전달해야 합니다.

검수된 활동 목록은 `backend/app/activities.py`에서 관리합니다. 부상이나 타인에 대한 위해 가능성이 있는 활동은 포함하지 않습니다.

## 기술 스택

- Frontend: React 19, TypeScript 5.9, Vite 8, React Router, Lucide icons, Vitest/Testing Library
- Backend: FastAPI, Pydantic, SQLAlchemy 2, Alembic, HTTPX, Uvicorn
- Database: 개발 SQLite, 운영 PostgreSQL + psycopg
- Runtime: Docker Compose, Nginx 정적 프런트 배포

## 구조

```text
omys/
├─ frontend/
│  ├─ src/components/       # 장소 검색, 조건 폼, 비밀 이동, 결과 카드
│  ├─ src/pages/            # 랜딩, 생성, 입장, 방 상태, 활동, 공유 화면
│  ├─ src/lib/api.ts        # 토큰·API·분석 클라이언트
│  └─ Dockerfile
├─ backend/
│  ├─ app/main.py           # REST API와 공개 정보 필터
│  ├─ app/models.py         # 장소 방과 익명 활동 세션 모델
│  ├─ app/activities.py     # 검수된 느낌별 활동 목록
│  ├─ app/places.py         # Google/mock provider와 짧은 TTL 캐시
│  ├─ app/services.py       # 영업 검증, 추첨 트랜잭션, 거리 계산
│  ├─ alembic/              # 전체 스키마 초기 migration
│  └─ tests/                # 다중 참가자·비밀·잠금·도착 테스트
├─ docker-compose.yml
├─ .env.example
└─ DEPLOY_CHECKLIST.md
```

## 로컬 실행 — SQLite

Python 3.12+와 Node 24+가 필요합니다. Windows PowerShell 기준입니다.

```powershell
Copy-Item .env.example .env
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

새 터미널에서:

```powershell
cd frontend
npm install
npm run dev
```

- 웹: http://localhost:5173
- API 문서: http://localhost:8000/docs
- 상태 확인: http://localhost:8000/api/health

## PostgreSQL / Docker Compose

`.env`의 PostgreSQL 비밀번호와 관리자 키를 바꾼 뒤 전체 스택을 실행합니다.

```bash
docker compose up -d --build
docker compose ps
```

- 웹: http://localhost:8080
- API: http://localhost:8010
- PostgreSQL: localhost:5433

백엔드 컨테이너는 DB healthcheck 뒤 `alembic upgrade head`를 실행합니다. DB만 실행하려면 `docker compose up -d db`, 로컬 백엔드를 PostgreSQL에 연결하려면 다음처럼 설정합니다.

```env
DATABASE_URL=postgresql+psycopg://omys:비밀번호@localhost:5432/omys
```

마이그레이션 명령:

```bash
cd backend
alembic upgrade head
alembic current
```

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./omys.db` | SQLAlchemy DB URL |
| `CORS_ORIGINS` | `http://localhost:5173` | 쉼표로 구분한 허용 origin |
| `FRONTEND_URL` | `http://localhost:5173` | 초대 링크 기준 URL |
| `PLACES_PROVIDER` | `mock` | `mock`, `google` 또는 `kakao` |
| `GOOGLE_PLACES_API_KEY` | 빈 값 | 서버 전용 Places API 키 |
| `KAKAO_REST_API_KEY` | 빈 값 | 서버 전용 카카오 Local API 키 |
| `TMAP_API_KEY` | 빈 값 | 서버 전용 TMAP 보행자 길찾기 API 키 |
| `VITE_KAKAO_JAVASCRIPT_KEY` | 빈 값 | 친구 모드 브라우저 장소 검색용 키 |
| `ADMIN_API_KEY` | 개발 기본값 | `/api/admin/stats`의 `X-Admin-Key` |
| `MIN_STAY_MINUTES` | `60` | 영업 종료 검증의 최소 체류시간 |
| `SEARCH_CACHE_SECONDS` | `180` | 검색 결과 TTL; 최종 검증은 캐시 우회 |
| `VITE_API_BASE_URL` | 빈 값 | 프런트 API URL; 로컬은 Vite proxy 사용 |

## Google Places API 설정

1. Google Cloud에서 **Places API (New)**를 활성화합니다.
2. 서버용 API 키를 만들고 Places API와 배포 서버 IP로 제한합니다.
3. 백엔드 환경에 `PLACES_PROVIDER=google`, `GOOGLE_PLACES_API_KEY=...`를 설정합니다.
4. 키를 `VITE_*` 변수나 프런트 코드에 넣지 마세요. 검색과 상세/영업 재검증은 모두 FastAPI 서버에서 호출합니다.

현재 내부 미스터리 지도는 목적지 정보 유출을 막기 위한 추상 경로 UI입니다. 추후 브라우저 지도 SDK를 붙일 경우 브라우저 키에는 반드시 운영 도메인 제한을 적용하고, 목적지 좌표/마커가 공개 전 네트워크 응답에 포함되지 않게 서버 측 경로 익명화가 필요합니다.

## 카카오 Local API 설정

1. 앱 관리 페이지의 `카카오맵 > 사용 설정`에서 상태를 `ON`으로 설정합니다.
2. 카카오 디벨로퍼스에서 앱의 REST API 키를 확인합니다.
3. 백엔드 환경에 `PLACES_PROVIDER=kakao`, `KAKAO_REST_API_KEY=...`를 설정합니다.
4. 장소 검색은 출발 좌표 반경 10km 내 결과를 거리순으로 반환합니다.
5. 카카오 Local API는 영업시간을 제공하지 않으므로 결과의 카카오맵 상세 페이지나 전화로 영업 여부를 확인해야 합니다.
6. 서버에서 카카오 Local API 연결이 제한된 환경은 JavaScript 키와 Web 플랫폼 도메인을 등록하면 친구 모드 검색을 브라우저에서 실행합니다.

## 테스트

```powershell
cd backend
.\.venv\Scripts\python -m pytest -q

cd ..\frontend
npm test
npm run build
```

## 코드 포맷

프런트엔드는 Prettier, 백엔드는 Ruff를 사용합니다. 커밋 전 아래 명령으로 전체 코드를 같은 형식으로 정리할 수 있습니다.

```powershell
cd frontend
npm run format
npm run format:check

cd ..\backend
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m ruff format --check app tests alembic
```

백엔드 테스트는 후보 격리, 다중 참가자 추첨, 결과 잠금, 재추첨 제한, 폐점 제외, 조건 불충족, 목적지 API 비노출, GPS 도착 공개, 공유 공개 시점을 검증합니다. 프런트 테스트는 랜딩의 두 모드와 회원가입 없는 초대 입장을 검증합니다.

관리자 지표:

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:8000/api/admin/stats
```

배포 후에는 `https://<배포주소>/admin`에서 `ADMIN_API_KEY`를 입력해 운영 통계를 확인할 수 있습니다.
기간은 최근 6시간, 12시간, 24시간, 3일 중 선택하며 모든 구간은 한국 시간 기준입니다.
API를 직접 호출할 때는 `range=6h`, `12h`, `24h`, `3d` 중 하나를 지정합니다.

인스타그램 프로필에는 기존 서비스 주소에 UTM 값을 붙인 링크를 사용합니다. 새 랜딩 페이지는 필요하지 않습니다.

```text
https://<배포주소>/?utm_source=instagram&utm_medium=social&utm_campaign=launch&utm_content=profile
```

스토리나 릴스 링크는 `utm_content`만 각각 `story`, `reels`로 바꾸면 관리자 화면의 `유입 경로`에서 위치별 방문자, 조회, 방 만들기 시작, 활동 시작을 확인할 수 있습니다.

## 배포

권장 구성은 관리형 PostgreSQL + 컨테이너 FastAPI + CDN/정적 호스팅 프런트입니다.

1. 운영 환경변수를 secret manager에 등록합니다.
2. PostgreSQL을 백업 가능한 관리형 인스턴스로 준비합니다.
3. backend 이미지를 배포한 뒤 release 단계에서 `alembic upgrade head`를 실행합니다.
4. frontend를 실제 `VITE_API_BASE_URL`로 빌드해 배포합니다.
5. HTTPS, CORS, 헬스체크, 외부 API 쿼터 알림을 확인합니다.
6. [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md)를 완료합니다.

## 현재 MVP 한계

- mock provider 장소는 개발 시나리오용이며 실제 영업 정보가 아닙니다. 공개 환경은 Google Places 또는 카카오 Local API 설정이 필요합니다.
- 대중교통/자동차 ETA는 현재 직선거리와 보수적 평균 속도 기반입니다. 실제 공개 전 Routes API 등 서버 측 경로/ETA provider 연결이 필요합니다.
- 목적지 노출 방지를 위해 MVP 지도는 실제 지도 타일 대신 추상 경로를 사용하며 음성 턴바이턴은 제공하지 않습니다.
- GPS 좌표는 이동 상태 계산에만 쓰고 DB에 저장하지 않지만, 브라우저 위치 정확도에 영향을 받습니다.
- in-memory rate limit/search cache는 단일 프로세스 기준입니다. 다중 인스턴스 운영은 Redis/API gateway로 교체해야 합니다.
- 별도 관리자 UI, 신고 흐름, 법적 문서, 오류 추적 SaaS는 포함하지 않았습니다.
