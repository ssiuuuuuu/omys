# OMYS Spring · iOS · Android 재구축 명세

> 문서 목적: 현재 React/FastAPI 기반 OMYS MVP를 Spring 백엔드와 iOS/Android 네이티브 앱으로 다시 만들기 위한 공통 인수인계 문서다. 팀원 또는 각 팀원의 AI에게 이 파일 전체를 먼저 제공하고, 담당 플랫폼 섹션을 추가 지시문으로 전달한다.

## 0. AI에게 가장 먼저 전달할 설명

아래 문장을 공통 프롬프트로 사용한다.

```text
우리는 OMYS(오늘의 미스터리 스팟)를 Spring 백엔드, iOS, Android 네이티브 앱으로 재구축한다.

OMYS는 친구나 연인이 외출 장소를 정하는 부담을 줄이고, 선정된 목적지를 도착할 때까지 숨겨 이동 자체를 놀이로 만드는 서비스다. 회원가입 없이 방장이 방을 만들고, 참가자는 6자리 초대 코드 또는 딥링크와 닉네임으로 참여한다.

핵심 모드는 세 가지다.
1) 친구 추천: 각 참가자가 서로에게 보이지 않는 장소 후보를 제출하고, 모두 완료하면 서버가 한 곳을 추첨한다.
2) OMYS 추천: 방장이 이동 시간, 예산, 카테고리 등의 조건을 보내면 서버가 실제 방문 가능한 장소를 검색·검증·필터링해 한 곳을 선택한다.
3) 미스터리 활동: 방과 위치 없이 분위기를 고르면 서버가 짧은 활동을 무작위 추천하고, 타이머·완료 기록·공유를 제공한다.

가장 중요한 보안 요구사항은 목적지 비공개다. 공개 전에는 API 응답, 로그, 지도 경로, 딥링크, 분석 이벤트 어디에도 선정 장소의 이름·주소·정확한 좌표·외부 장소 ID가 권한 없는 사용자에게 노출되면 안 된다. 클라이언트에서 가리는 방식이 아니라 서버가 응답 자체에서 제거해야 한다.

구현의 기준은 이 문서(SPRING_IOS_ANDROID_REBUILD_SPEC.md)다. 먼저 OpenAPI 계약과 상태 전이를 합의한 뒤 백엔드와 두 앱을 병렬 개발한다. 기존 FastAPI/React 코드는 동작 참고 자료일 뿐 그대로 번역하지 말고, 아래의 보안·안전 개선사항을 반영한다.
```

## 1. 서비스 정의

### 1.1 한 줄 소개

친구들과 외출 장소 또는 즉석 활동을 랜덤으로 정하고, 목적지를 도착할 때까지 숨겨 주는 미스터리 외출 서비스.

### 1.2 핵심 사용자 가치

- “오늘 뭐 하지/어디 가지?”를 정하는 시간을 줄인다.
- 참가자별 후보를 비밀로 받아 눈치 보지 않고 의견을 내게 한다.
- 목적지를 결과가 아니라 이동 과정까지 포함한 놀이로 만든다.
- 회원가입 없이 초대 링크와 닉네임만으로 진입 장벽을 낮춘다.

### 1.3 MVP 범위

- 방 생성, 6자리 초대 코드, 초대 딥링크, 닉네임 참여
- 친구 추천 후보 검색·비밀 제출·제출 완료·서버 추첨
- 조건 기반 OMYS 추천 및 실제 영업 가능성 검증
- 출발 전 최대 1회 재추첨
- `waiting → drawn → navigating → revealed` 상태 전이
- 위치 기반 이동 진행률과 100m 이내 목적지 공개
- 방장 수동 공개 옵션
- 공개 전/후가 구분되는 공유 링크
- 방과 무관한 미스터리 활동 추천, 건너뛰기, 타이머, 결과 기록
- 익명 퍼널 이벤트와 관리자용 집계 API

MVP에서 제외하는 항목은 회원 계정, 친구 목록, 채팅, 결제, 리뷰 작성, 상시 백그라운드 위치 추적, 완전한 턴바이턴 내비게이션이다.

## 2. 현재 구현 요약과 새 목표

### 2.1 현재 저장소

| 영역 | 현재 구현 | 새 구현 목표 |
|---|---|---|
| Web | React 19, TypeScript, Vite, React Router | 초대/공유용 최소 웹 페이지만 유지 가능 |
| API | FastAPI, Pydantic, SQLAlchemy, Alembic | Java 21 LTS, Spring Boot 기반 REST API |
| DB | 개발 SQLite, 운영 PostgreSQL | 모든 공용 환경 PostgreSQL, 로컬은 Testcontainers 권장 |
| iOS | 없음 | Swift, SwiftUI, async/await 기반 네이티브 앱 |
| Android | 없음 | Kotlin, Jetpack Compose, Coroutines/Flow 기반 네이티브 앱 |
| 장소 | Google Places 또는 Kakao Local, mock provider | 서버 전용 provider 추상화 유지 |
| 지도/경로 | 카카오맵 표시, 서버가 일부 경로만 반환 | 목적지를 누설하지 않는 플랫폼 지도 렌더링 |
| 동기화 | 방 상태 2.5초 polling | 1차 polling 호환, 필요 시 SSE/WebSocket으로 확장 |
| 배포 | Docker Compose, Nginx | Spring 컨테이너 + PostgreSQL + 선택적 Redis + HTTPS |

### 2.2 재구축 원칙

1. 계약 우선: Spring이 임의 응답을 만들지 말고 OpenAPI를 먼저 확정한다.
2. 서버 권한 우선: 추첨, 권한, 공개 가능 여부, 장소 검증은 모두 서버가 결정한다.
3. 플랫폼 동등성: iOS와 Android의 기능, 상태명, 오류 처리, 분석 이벤트명을 동일하게 유지한다.
4. 비밀 정보 최소화: 공개 전 클라이언트가 목적지를 역산할 수 있는 데이터도 주지 않는다.
5. MVP 우선: 실시간 기술을 먼저 도입하기보다 polling으로 기능 동등성을 만든 후 개선한다.
6. 마이그레이션 가능성: 기존 운영 데이터가 있다면 UUID와 상태값을 유지해 PostgreSQL 데이터를 옮길 수 있게 한다.

## 3. 권장 기술 스택

정확한 라이브러리 버전은 프로젝트 생성 시점의 최신 호환 안정 버전으로 잠근다. 메이저 버전은 세 플랫폼에서 동시에 올리지 않는다.

### 3.1 Spring 백엔드

- Java 21 LTS
- Spring Boot 최신 호환 안정 버전
- Spring Web MVC
- Spring Validation
- Spring Data JPA + Hibernate
- PostgreSQL
- Flyway: 스키마 마이그레이션의 단일 기준
- springdoc-openapi: OpenAPI 문서와 클라이언트 계약 생성
- WebClient: Kakao/Google 등 외부 API 호출
- Resilience4j: timeout, retry, circuit breaker. 무조건 재시도하지 말고 조회 요청만 제한적으로 적용
- Caffeine: 단일 인스턴스 개발 캐시
- Redis: 다중 인스턴스 운영의 rate limit, 검색 캐시, 짧은 수명의 경로 상태에 권장
- Micrometer + Actuator: health, metrics
- Logback JSON 로그, OpenTelemetry/Sentry 계열 오류 추적은 운영 선택 사항
- JUnit 5, AssertJ, MockMvc 또는 REST Assured, Testcontainers(PostgreSQL/Redis), WireMock
- Gradle Kotlin DSL

권장 구조는 마이크로서비스가 아닌 모듈형 모놀리스다.

```text
backend-spring/
├─ src/main/java/.../omys/
│  ├─ room/          # 방, 참가자, 상태 전이
│  ├─ place/         # 장소 검색 provider와 후보
│  ├─ selection/     # 추첨, 재추첨, 영업 검증
│  ├─ navigation/    # 거리, 비밀 경로, 공개 판정
│  ├─ activity/      # 미스터리 활동/세션
│  ├─ analytics/     # 익명 이벤트와 집계
│  ├─ admin/         # 운영 API
│  └─ common/        # 오류, 보안, 설정, 시간
├─ src/main/resources/db/migration/
└─ src/test/
```

### 3.2 iOS

- Swift 6 계열, SwiftUI
- 최소 지원 버전 제안: iOS 17 이상. 실제 타깃 사용자를 확인한 후 하향 여부 결정
- 아키텍처: feature 단위 MVVM 또는 단방향 상태 흐름
- URLSession + async/await; OpenAPI 생성 클라이언트 사용을 우선 검토
- Codable. 서버 JSON 이름은 기존 호환을 위해 `snake_case`, 앱에서는 coding strategy 적용
- CoreLocation: foreground `whenInUse` 권한만 MVP에 사용
- MapKit 또는 합의한 지도 SDK. 공개 전 목적지 마커를 앱 메모리에 미리 만들지 않는다
- Keychain: 참가자 토큰 보관
- UserDefaults: 비민감 설정과 익명 세션 ID만 보관
- Universal Links: `https://<domain>/join/{code}`, `https://<domain>/share/{code}`
- ShareLink/UIActivityViewController: 초대와 결과 공유
- XCTest + Swift Testing, URLProtocol mock, UI 테스트

### 3.3 Android

- Kotlin
- Jetpack Compose + Material 3
- 아키텍처: feature 단위 MVVM, ViewModel + StateFlow
- Coroutines/Flow
- Retrofit + OkHttp 또는 OpenAPI 생성 클라이언트
- Kotlinx Serialization
- Hilt
- Google Play Services Location 또는 플랫폼 위치 API: foreground 권한만 MVP에 사용
- Google Maps SDK 또는 합의한 지도 SDK. 공개 전 목적지 마커/좌표 캐시 금지
- Android Keystore 기반 암호화 저장소: 참가자 토큰
- DataStore: 비민감 설정과 익명 세션 ID
- Android App Links: `https://<domain>/join/{code}`, `https://<domain>/share/{code}`
- Android Sharesheet
- JUnit, Turbine, MockWebServer, Compose UI test

### 3.4 인프라

- 운영 PostgreSQL 16 이상 또는 팀이 선택한 관리형 호환 버전
- Docker 이미지와 환경별 설정 분리
- HTTPS 강제, reverse proxy/load balancer
- Secret Manager 또는 배포 플랫폼 secret 사용. 저장소와 앱 번들에 서버 API 키를 넣지 않는다
- CI: backend test/build, iOS test, Android test/lint를 PR마다 실행
- CD: dev → staging → production 순서. Flyway는 배포 단계에서 한 번만 실행
- DB 자동 백업, 외부 장소 API quota 알림, 5xx/latency 알림

## 4. 도메인과 상태 모델

### 4.1 방 상태

```text
waiting --추첨/조건 추천 성공--> drawn --방장 출발--> navigating --공개 성공--> revealed
   └── 조건 검색 실패 시 waiting 유지
drawn --방장 재추첨(최대 1회)--> drawn
```

허용되지 않은 상태 전이는 HTTP `409 Conflict`로 거절한다. 같은 요청을 반복해도 안전하도록 추첨, 출발, 공개는 가능한 범위에서 멱등하게 만든다.

### 4.2 모드

- `friends`: 참가자가 각자 후보를 1개 이상 비밀 제출한다. 참가자 2명 이상, 전원 제출 완료 후 방장만 추첨할 수 있다.
- `omys`: 방장이 조건을 저장하면 서버가 검색·필터·검증 후 즉시 한 곳을 선정한다.
- 미스터리 활동은 Room과 독립된 `ActivitySession`이다.

### 4.3 주요 엔티티

#### Room

- `id: UUID`
- `inviteCode: String(6)`, 대문자 영문+숫자, 최소 한 글자와 한 숫자, unique
- `title: String(1..60)`
- `mode: friends | omys`
- `departureLabel: String(1..160)`
- `departureLatitude`, `departureLongitude`
- `status: waiting | drawn | navigating | revealed`
- `joinClosed: Boolean`
- `redrawAllowed: Boolean`
- `hideUntilArrival: Boolean`
- `redrawCount: Int`, 최대 1
- `selectedPlaceCandidateId: UUID?`
- `createdAt`, `startedAt?`, `revealedAt?`는 UTC 저장
- 낙관적 잠금용 `version` 또는 추첨 시 비관적 row lock 필요

#### Participant

- `id: UUID`, `roomId: UUID`
- `nickname: String(1..20)`
- `tokenHash: String`, 원문 토큰은 생성 응답에서 한 번만 제공하는 것을 권장
- `isHost: Boolean`
- `submissionCompleted: Boolean`
- `createdAt`

#### PlaceCandidate

- `id`, `roomId`, `participantId?`
- `externalPlaceId`, `name`, `category`, `address`, `latitude`, `longitude`
- `priceLevel?`, `businessStatus?`, `openNow?`, `nextCloseTime?`
- `lastVerifiedAt?`, `isPublicOutdoor`, `isSelected`
- `placeUrl?`, `phone?`
- unique: `(room_id, participant_id, external_place_id)`

#### OmysCondition

- 방당 하나
- `transportMode: walk | transit | car`
- `maxTravelMinutes: 5..180`
- `budgetPerPerson?: 0..1_000_000`
- `partySize: 1..20`
- `preferredCategories: 최대 10개`
- `indoorOutdoor: indoor | outdoor | any`
- `excludedActivities: 최대 10개`
- `includesFood?: Boolean`
- `accessibility?: String(120)`
- `totalAvailableMinutes?: 30..720`

#### Selection

- `roomId`, `placeCandidateId`, `attempt`, `active`, `createdAt`
- unique: `(room_id, attempt)`, `(room_id, place_candidate_id)`
- 이전 선정지는 재추첨 대상에서 제외한다.

#### ActivitySession

- `id`, `anonymousSessionId`
- `selectedMood?: light | funny | dopamine`
- `currentActivityId?`, `previouslyDrawnActivityIds[]`
- `status: choosing | drawn | started | completed | abandoned`
- `startedAt?`, `completedAt?`
- `result?: success | failure | abandoned`, `partySize?`

#### AnalyticsEvent

- `anonymousSessionId`, `roomId?`, `eventName`, `metadata`, `createdAt`
- 위치 좌표, 참가자 토큰, 장소의 비공개 상세는 metadata에 절대 기록하지 않는다.

## 5. 핵심 비즈니스 규칙

### 5.1 인증과 권한

- 가입/로그인은 MVP에 없다.
- 방 생성/입장 성공 시 256비트 이상 무작위 참가자 토큰을 발급한다.
- 기존 호환 헤더는 `X-Participant-Token`이다. 신규 계약에서 `Authorization: Bearer`로 바꾸려면 세 클라이언트와 동시에 합의한다.
- 토큰은 해당 방의 참가자에게만 유효하다.
- 방장 전용: 친구 모드 추첨, 재추첨, 출발, 수동 공개.
- 참가자 전용: 방 조회, 장소 검색, 본인 후보 제출, 이동 정보 요청, 도착 공개.
- 관리자 API는 앱에 내장된 키로 호출하지 않는다. 운영자 인증 또는 배포 secret 기반 별도 접근으로 분리한다.

### 5.2 친구 추천

1. 방장이 `friends` 방을 만든다.
2. 참가자가 딥링크/코드와 닉네임으로 입장한다.
3. 각 참가자는 서버 검색 결과에서 장소를 골라 제출한다.
4. 조회 응답에는 본인이 제출한 후보만 `own_candidates`로 보인다.
5. 참가자별로 후보가 1개 이상 있어야 제출 완료할 수 있다.
6. 2명 이상이며 전원 완료해야 방장이 추첨할 수 있다.
7. 서버가 후보 순서를 보안 난수로 섞고, 최종 영업 검증을 통과한 첫 장소를 트랜잭션 안에서 잠근다.
8. `hideUntilArrival=false`이면 당첨 후보 제출자만 가이드로 장소를 볼 수 있다. `true`이면 도착 전 누구도 장소를 보지 못한다.
9. 최종 공개 뒤에만 모든 참가자가 장소와 제출자 닉네임을 본다.

### 5.3 OMYS 추천

지원 카테고리:

- `게임·실내 놀거리`
- `운동·액티비티`
- `관광·산책`
- `쇼핑·구경`
- `데이트코스·이색 체험`

필터 순서:

1. 출발 좌표와 이동 시간으로 검색 반경을 계산한다.
2. 선호 카테고리별 검색을 병렬 실행하되 전체 timeout을 둔다.
3. 외부 장소 ID 기준 중복 제거.
4. 이동 시간, 제외 활동, 실내외, 음식 포함 여부, 총 가용 시간, 대략적 가격 조건을 적용한다.
5. 최종 추첨 직전 provider detail API로 영업 상태를 다시 확인한다.
6. `영업 중 + 예상 이동 시간 + 최소 체류 60분 이전에 닫지 않음`을 만족해야 한다.
7. 공원 등 공공 야외 장소에는 영업시간 예외를 둘 수 있다.
8. Kakao Local처럼 영업시간을 주지 않는 provider는 `UNKNOWN_KAKAO`로 표시하고 앱에서 상세 페이지/전화 확인 안내를 제공한다.
9. 후보가 없으면 방은 `waiting`을 유지하고 조건을 완화해 재시도할 수 있는 `422` 오류를 준다.

현재 ETA는 직선거리와 보수적 평균 속도(`walk 4.2`, `transit 18`, `car 24 km/h`)를 사용한다. 운영 품질을 높이려면 서버에서 실제 경로/ETA provider로 교체한다.

### 5.4 추첨과 동시성

- 애플리케이션 인스턴스의 메모리 lock만 사용하면 안 된다.
- PostgreSQL에서 Room row를 `SELECT ... FOR UPDATE`로 잠그거나 동등한 원자적 전략을 사용한다.
- 동일 방/시도 번호와 동일 방/장소의 DB unique constraint를 유지한다.
- 중복 draw 요청은 기존 선정 결과를 반환한다.
- 재추첨은 방장만, `drawn` 상태에서, 출발 전에, 최대 1회만 가능하다.
- 추첨에는 `SecureRandom`을 사용한다.

### 5.5 이동과 목적지 공개

- 앱은 foreground 위치를 받아 일정 간격 또는 의미 있는 거리 변화 시 `/navigation`을 호출한다.
- 서버는 남은 거리, 대략 ETA, 진행률, 방향 힌트, 현재 위치 앞쪽의 제한된 경로만 반환한다.
- 공개 전 `destination`, 장소 이름, 주소, 전화, URL, 외부 장소 ID를 반환하지 않는다.
- 제한 경로의 끝점만으로 목적지를 쉽게 역산하지 못하도록 마지막 100m를 보류한다.
- 도착 판정 기본 반경은 100m다. 정확도가 나쁜 위치는 오탐을 막기 위한 정책을 추가한다.
- 100m 이내이면 `revealAvailable=true`와 필요한 최소 좌표만 반환하고, `/reveal` 재검증 후 Room을 `revealed`로 변경한다.
- `hideUntilArrival=false`일 때 방장이 수동 공개할 수 있다.
- GPS 좌표는 판정에만 쓰고 기본적으로 DB, analytics, 일반 로그에 저장하지 않는다.
- 네트워크가 끊기면 마지막 안전한 진행 UI를 유지하되 클라이언트 단독으로 목적지를 공개하지 않는다.

### 5.6 미스터리 활동

- 분위기: `light`, `funny`, `dopamine`.
- 세션 생성 → 분위기별 추첨 → 건너뛰기 → 시작 → 성공/실패/중단 완료 순서다.
- 같은 세션에서 아직 나오지 않은 활동을 우선하고, 전체 소진 시 목록을 리셋한다.
- 서버의 `startedAt`을 기준으로 앱 타이머를 복구한다.
- 활동 카탈로그는 코드 하드코딩보다 DB 또는 검수된 버전 파일로 관리해도 된다.
- 신체 위해, 화상, 감전, 폭죽으로 사람 맞히기, 음식물 투척 등 위험하거나 불쾌감을 유발할 수 있는 활동은 절대 배포하지 않는다.

## 6. API 계약

### 6.1 공통 규칙

- Base URL 예: `https://api.example.com/api/v1`
- JSON은 UTF-8, 날짜는 UTC ISO-8601, 좌표는 WGS84.
- 기존 앱과 병행하지 않으면 `/api/v1`로 버저닝하고, 병행한다면 기존 `/api` 호환 계층을 둔다.
- 인증 필요 API는 참가자 토큰을 요구한다.
- 목록은 순서가 의미 없더라도 항상 안정된 타입을 반환한다.
- 오류 형식을 모든 endpoint에서 통일한다.

```json
{
  "code": "ROOM_NOT_JOINABLE",
  "message": "이 방은 더 이상 참가할 수 없습니다.",
  "field_errors": [],
  "trace_id": "서버 추적용 ID"
}
```

권장 상태 코드: 검증 `400/422`, 토큰 없음 `401`, 권한 없음 `403`, 없음 `404`, 상태 충돌/중복 `409`, rate limit `429`, 외부 provider 장애 `503`.

### 6.2 엔드포인트 목록

| Method | Path | 권한 | 목적 |
|---|---|---|---|
| GET | `/api/health` | 공개 | 상태와 provider 확인 |
| GET | `/api/categories` | 공개 | 지원 장소 카테고리 |
| POST | `/api/rooms` | 공개 | 방과 방장 참가자 생성 |
| POST | `/api/rooms/{code}/join` | 공개 | 닉네임으로 참가 |
| GET | `/api/rooms/{code}` | 참가자 | 권한별로 필터된 방 상태 조회 |
| GET | `/api/rooms/{code}/places/search?q=&category=` | 참가자 | 출발지 주변 장소 검색 |
| POST | `/api/rooms/{code}/candidates` | 참가자 | 친구 모드 본인 후보 제출 |
| POST | `/api/rooms/{code}/submission/complete` | 참가자 | 후보 제출 완료 |
| POST | `/api/rooms/{code}/draw` | 방장 | 친구 모드 추첨 |
| POST | `/api/rooms/{code}/conditions` | 방장 | OMYS 조건 저장, 검색, 추첨 |
| POST | `/api/rooms/{code}/redraw` | 방장 | 출발 전 1회 재추첨 |
| POST | `/api/rooms/{code}/start` | 방장 | 이동 시작 |
| POST | `/api/rooms/{code}/navigation` | 참가자 | 현재 위치 기반 비밀 이동 정보 |
| POST | `/api/rooms/{code}/reveal` | 참가자/방장 | 도착 또는 수동 공개 |
| GET | `/api/share/{code}` | 공개 | 공개 시점에 따른 공유 정보 |
| GET | `/api/activities` | 공개 | 분위기와 활성 활동 목록 |
| POST | `/api/activity-sessions` | 공개 | 익명 활동 세션 생성 |
| GET | `/api/activity-sessions/{id}` | 세션 소유 검증 권장 | 활동 상태 복구 |
| POST | `/api/activity-sessions/{id}/draw` | 세션 소유 검증 권장 | 분위기별 활동 추첨 |
| POST | `/api/activity-sessions/{id}/skip` | 세션 소유 검증 권장 | 현재 활동 건너뛰기 |
| POST | `/api/activity-sessions/{id}/start` | 세션 소유 검증 권장 | 시작 시각 저장 |
| POST | `/api/activity-sessions/{id}/complete` | 세션 소유 검증 권장 | 결과 저장 |
| POST | `/api/analytics` | 공개+rate limit | 허용 목록의 익명 이벤트 수집 |
| GET | `/api/admin/stats?range=6h|12h|24h|3d` | 관리자 | KST 기준 퍼널 집계 |

### 6.3 핵심 요청 예시

방 생성:

```json
{
  "title": "토요일 모험",
  "mode": "friends",
  "host_nickname": "방장",
  "departure": {
    "label": "서울시청",
    "latitude": 37.5665,
    "longitude": 126.9780
  },
  "redraw_allowed": true,
  "hide_until_arrival": true,
  "join_closed": false
}
```

생성 응답에는 `invite_code`, `participant_id`, 원문 `participant_token`, `invite_url`을 포함한다. 토큰은 이후 일반 응답에 다시 포함하지 않는다.

신규 후보 제출 API는 클라이언트가 장소 전체를 신뢰 데이터로 보내는 방식보다 아래처럼 외부 ID만 받는 것을 권장한다.

```json
{
  "external_place_id": "provider-specific-id"
}
```

서버가 provider로 상세를 재조회하고 이름, 주소, 좌표, 영업 상태를 저장해야 한다.

이동 요청:

```json
{
  "latitude": 37.5665,
  "longitude": 126.9780,
  "accuracy": 18.2
}
```

공개 전 이동 응답 예시:

```json
{
  "remaining_meters": 820,
  "eta_minutes": 12,
  "progress_percent": 44,
  "direction": "북쪽 · 동쪽 방향으로 이동하세요",
  "reveal_available": false,
  "hide_until_arrival": true,
  "accuracy_meters": 18.2,
  "route_path": [
    { "latitude": 37.5665, "longitude": 126.9780 }
  ],
  "message": "목적지 근처에 도착하면 공개할 수 있습니다"
}
```

이 응답에는 `destination`과 장소 상세가 없어야 한다.

### 6.4 Room 조회 응답의 공개 정책

| 필드 | waiting | drawn/navigating | revealed |
|---|---:|---:|---:|
| 참가자 목록/제출 완료 여부 | 공개 | 공개 | 공개 |
| 본인 후보 | 본인에게만 | 본인에게만 | 본인에게만 또는 정책에 따라 공개 |
| 다른 사람 후보 | 비공개 | 비공개 | 기본 비공개 |
| 선정 장소 상세 | 비공개 | 가이드 정책에 맞는 사용자만 | 모든 참가자 |
| 선정자 닉네임 | 비공개 | 비공개 | 친구 모드 참가자에게 공개 |
| 공유 API 장소 상세 | 비공개 | 비공개 | 공개 |

DTO를 엔티티에서 자동 직렬화하지 않는다. 역할과 상태별 응답 DTO를 명시적으로 조립해 좌표 누출을 막는다.

## 7. 외부 장소/지도 연동

### 7.1 Provider 인터페이스

Spring에는 최소 아래 인터페이스를 둔다.

```java
interface PlacesProvider {
    List<PlaceResult> search(PlaceSearchQuery query);
    Optional<PlaceResult> verify(String externalPlaceId);
}
```

- 구현체: `KakaoPlacesProvider`, `GooglePlacesProvider`, `MockPlacesProvider`.
- 외부 키는 서버에만 둔다.
- 검색 결과는 짧은 TTL로 캐시해도 최종 추첨의 `verify`는 캐시를 우회한다.
- connect/read/전체 timeout, 오류 매핑, quota 관측을 구현한다.
- provider 응답 원문 전체와 위치/키를 운영 로그에 남기지 않는다.
- 클라이언트가 직접 검색 SDK를 쓰는 경우에도 제출 시 서버가 ID와 거리, URL, 좌표를 재검증한다.

### 7.2 초대와 공유 링크

네이티브 앱만으로는 미설치 사용자와 SNS 미리보기를 처리하기 어렵다. 같은 HTTPS 도메인에 다음을 제공한다.

- `/join/{code}`: 설치 시 앱으로 열고, 미설치 시 스토어/간단 안내 페이지
- `/share/{code}`: 공개 전 “목적지는 비밀”, 공개 후 결과 카드
- iOS `apple-app-site-association`
- Android `assetlinks.json`
- Open Graph 제목/이미지. 공개 전 장소명은 OG metadata에도 넣지 않는다.

Firebase Dynamic Links는 전제로 두지 말고 표준 Universal Links/App Links를 사용한다.

## 8. 플랫폼 공통 화면과 UX

1. 랜딩
   - 친구 추천, OMYS 추천, 할 거 없을 때
   - 코드 직접 입력
2. 방 만들기
   - 모드, 방 제목, 닉네임, 출발 위치
   - 재추첨 허용, 도착까지 숨기기
3. 방 입장
   - 코드 확인, 닉네임 입력
4. 친구 모드 대기실
   - 참가자와 제출 완료 상태
   - 본인 후보 검색/제출/완료
   - 방장은 전원 완료 후 추첨
5. OMYS 조건
   - 이동 수단, 시간, 예산, 인원, 카테고리, 실내외, 제외 활동, 음식, 총시간
6. 추첨 결과 대기
   - 장소 상세 대신 선정 완료와 출발 버튼
   - 조건에 따른 가이드 화면
7. 미스터리 이동
   - 현재 위치, 안전하게 잘린 앞쪽 경로, 거리/ETA/진행률, 공개 가능 상태
8. 공개 결과
   - 장소명, 카테고리, 주소, 거리, 영업 확인 시각, 전화/지도 열기, 공유
9. 미스터리 활동
   - 분위기 선택, 활동 카드, 건너뛰기, 시작/타이머, 성공/실패/중단, 공유
10. 오류/권한 상태
   - 위치 권한 거절, GPS 부정확, 네트워크 단절, 만료/잘못된 코드, provider 지연

두 앱은 동일한 디자인 토큰 이름(색, spacing, radius, typography)을 사용하고, Figma가 없다면 현재 웹을 시각 참고 자료로 사용한다. 접근성 라벨, Dynamic Type/font scale, 색 대비, 터치 영역을 처음부터 적용한다.

## 9. 모바일 상태·저장·네트워크 정책

- 방별 참가자 토큰은 보안 저장소에 `inviteCode → token`으로 저장한다.
- 앱 재실행 시 저장 토큰과 딥링크 코드로 Room을 복구한다.
- 익명 분석 ID는 앱 설치 단위 UUID로 만들되 광고 ID나 기기 고유 ID를 쓰지 않는다.
- waiting/drawn 화면은 2.5초 polling으로 시작하고, 앱이 background면 중지한다.
- HTTP timeout, 취소, 중복 탭 방지, 지수 backoff를 공통 네트워크 계층에 구현한다.
- `401/403`이면 해당 방 토큰을 제거하고 입장 화면으로 유도한다.
- `409`는 현재 상태를 다시 조회한 뒤 사용자 메시지를 표시한다.
- `429/503`은 재시도 가능 상태로 표시하되 자동 무한 재시도하지 않는다.
- POST 재시도에 대비해 `Idempotency-Key` 도입을 권장한다. 특히 create/draw/start/reveal에 적용한다.
- 장소와 목적지 응답은 디스크 HTTP 캐시에 저장하지 않도록 민감 endpoint의 cache header를 설정한다.

## 10. 보안·개인정보 요구사항

### P0

- 목적지 공개 전 이름, 주소, 좌표, 외부 ID, 전화, URL을 권한 없는 응답과 로그에서 제거
- 참가자 토큰을 Keychain/Keystore에 저장하고 서버 DB에는 hash 저장 권장
- 서버 API 키, 관리자 키를 iOS/Android 번들에 포함하지 않음
- 현재 코드의 기본 내비게이션 관리자 키와 요청 body의 `admin_key` 우회 경로를 운영 버전에서 제거
- 입력 길이 검증, 허용 enum 검증, 출력 escaping. HTML을 저장 값 자체에 escape하기보다 출력 컨텍스트에 맞게 처리
- CORS는 공개 웹 origin만 허용. 네이티브 앱 보안 수단으로 CORS에 의존하지 않음
- 전역/endpoint별 rate limit. join, search, analytics는 별도 제한
- 운영 로그에 토큰, 좌표, 비공개 장소, 외부 API 키가 들어가지 않도록 masking 테스트
- 공개 전 share/OG/image endpoint도 장소를 노출하지 않는 통합 테스트

### 개인정보

- 위치 권한 안내에 사용 목적과 저장하지 않는다는 정책을 명확히 쓴다.
- MVP는 foreground 위치만 사용한다. 앱 종료 후 추적하지 않는다.
- 개인정보 처리방침과 위치정보 관련 법적 검토를 출시 전에 완료한다.
- 분석 metadata는 allowlist 방식으로 받고 key 40자, value 200자, 최대 20개 등 제한을 둔다.
- 보존 기간과 방/분석 데이터 삭제 정책을 정한다.

## 11. 현재 코드에서 그대로 옮기면 안 되는 항목

재구축 전 반드시 해결할 P0/P1 목록이다.

1. `backend/app/activities.py`의 일부 dopamine 활동에 폭죽, 뜨거운 국물, 날계란, 전기파리채 등 위해 가능성이 있는 내용이 있다. 안전 검수된 목록으로 교체해야 한다. 현재 안전성 테스트 의도와 데이터가 서로 맞지 않는다.
2. `navigation_admin_key` 기본값과 `/reveal` body의 관리자 키 방식은 앱/네트워크에 노출될 수 있다. 운영 기능에서는 제거한다.
3. 활동 세션은 현재 session UUID만 알면 조회/변경할 수 있다. 별도의 세션 토큰 또는 서명된 공유 권한을 추가한다.
4. 현재 rate limit, 검색 캐시, 내비게이션 경로 캐시는 프로세스 메모리다. 다중 인스턴스에서는 Redis/API gateway 또는 stateless 설계로 바꾼다.
5. 현재 위치 기반 ETA는 실제 도로/대중교통 시간이 아니라 직선거리 추정이다. UI에서 “예상”으로 표시하거나 실제 경로 provider를 연결한다.
6. 현재 일부 Kakao 검색 결과는 영업시간을 확인하지 못해도 후보가 된다. 사용자 안내와 최종 확인 UX가 필요하다.
7. 프런트 OMYS 조건 화면은 현재 선택과 무관하게 `transport_mode: walk`를 보내는 코드가 있으므로 네이티브 구현은 선택값을 정확히 전송해야 한다.
8. API의 엔티티/DTO 경계를 강화해 향후 필드 추가가 비밀 정보 노출로 이어지지 않게 한다.

## 12. 분석 이벤트

기존 이벤트명을 가능한 그대로 유지해 전환 전후 지표를 비교한다.

```text
landing_view, mode_selected, room_created, invite_link_copied,
participant_joined, place_submitted, draw_started, spot_selected,
navigation_started, spot_revealed, result_shared, redraw_requested,
no_candidate_found, activity_tab_opened, activity_page_view,
activity_mood_selected, activity_drawn, activity_skipped,
activity_started, activity_completed, activity_abandoned, activity_shared
```

관리 지표:

- 방문자/페이지뷰 또는 앱 화면뷰
- 활동 탭 방문자/화면뷰
- 생성 방 수, 2명 이상 참여 방 수
- 추첨 완료, 공개 완료, 공유 수
- 방 생성→추첨, 추첨→공개 전환율
- 최근 `6h`, `12h`, `24h`, `3d`, Asia/Seoul 기준 집계

## 13. 테스트와 완료 조건

### 13.1 백엔드 필수 테스트

- 초대 코드는 6자리, 영문과 숫자를 모두 포함하고 unique
- 토큰 없이 방 조회 불가, 다른 방 토큰 사용 불가
- 각 사용자는 본인 후보만 조회 가능
- 2명 미만 또는 미완료 참가자가 있으면 친구 추첨 불가
- 동시 draw 2회에도 Selection은 하나만 활성화
- 같은 draw 재요청은 같은 장소 반환
- 폐업/현재 영업 불가/체류 전에 닫는 장소는 선정되지 않음
- 1차 재추첨 성공, 2차와 출발 후 재추첨 실패
- 공개 전 모든 Room/share/navigation 응답에 목적지 정보가 없음
- 잘린 경로가 마지막 비공개 구간을 포함하지 않음
- 100m 밖 reveal 실패, 100m 안 reveal 성공
- 수동 공개는 방장만 가능
- 공개 후 share에서만 장소 상세 제공
- OMYS 후보 없음 후 조건 완화 재시도 가능
- 활동은 즉시 반복하지 않고 시작 전 완료 불가
- 위해 활동 금칙어/검수 목록 테스트
- 관리자 지표 인증과 시간 bucket 검증
- 로그에 token/좌표/비공개 장소가 없는지 검증

### 13.2 iOS/Android 공통 계약 테스트

- 동일 fixture JSON을 두 앱이 모두 decode
- 서버 오류 형식을 동일하게 표현
- 앱 재시작 뒤 방/활동 세션 복구
- 딥링크 cold start/warm start/미설치 fallback
- 위치 권한 허용, 1회 거절, 영구 거절, GPS 불안정 상태
- background 전환 시 polling/위치 호출 중지, foreground 복귀 시 최신 상태 조회
- 공개 전 지도/로그/캐시에 목적지 좌표 없음
- 네트워크 중복 탭에도 추첨/시작/공개 상태가 깨지지 않음
- 글자 크기 확대와 스크린리더의 핵심 흐름 완료

### 13.3 전체 인수 테스트

```text
시나리오 A: iOS 방장 + Android 참가자
방 생성 → 딥링크 입장 → 각자 비밀 후보 → 전원 완료 → 방장 추첨
→ 두 기기에서 비밀 정책 확인 → 출발 → Android 위치로 도착 → 공개 → 공유 링크 확인

시나리오 B: Android 방장 OMYS 추천
방 생성 → 좁은 조건으로 후보 없음 → 조건 완화 → 선정 → 출발
→ 100m 밖 공개 거절 → 100m 안 공개 성공 → iOS에서 공유 링크 열기

시나리오 C: 미스터리 활동
세션 생성 → 분위기 선택 → skip → start → 앱 재시작 → 타이머 복구
→ success/failure/abandoned 기록 → 공유
```

## 14. 팀 작업 분리와 순서

세 개의 개발 트랙을 다음처럼 나눈다.

### Backend 담당

- OpenAPI 초안과 example fixture를 가장 먼저 제공
- PostgreSQL/Flyway/JPA 모델, 상태 전이, 권한, 추첨 transaction
- 장소 provider, 비밀 이동 응답, 활동/분석 API
- Docker/환경변수/관측/통합 테스트

### iOS 담당

- OpenAPI fixture 기반 네트워크 계층과 도메인 모델
- SwiftUI 화면, Keychain, CoreLocation, 지도, Universal Links, 공유
- 상태 복구, polling lifecycle, 접근성 및 iOS 테스트

### Android 담당

- OpenAPI fixture 기반 네트워크 계층과 도메인 모델
- Compose 화면, Keystore, 위치, 지도, App Links, 공유
- 상태 복구, polling lifecycle, 접근성 및 Android 테스트

사용자 포함 총 4명이라면 남는 한 명은 제품/디자인/QA만 맡기기보다 계약·통합 담당으로 두는 것이 좋다. OpenAPI 변경 관리, 공통 fixture, 딥링크 도메인, CI/CD, cross-platform 인수 테스트를 소유한다. 팀이 총 3명이라면 이 역할을 세 명이 PR rotation으로 나눈다.

### 권장 구현 순서

1. 상태 enum, 오류 규격, OpenAPI, fixture JSON 확정
2. 방 생성/입장/조회와 토큰 저장
3. 친구 후보 제출/완료/추첨
4. OMYS 조건/장소 provider/영업 검증
5. 출발/이동/공개와 비밀 누출 테스트
6. 딥링크/공유용 최소 웹 페이지
7. 미스터리 활동
8. 분석/관리자/운영 관측
9. 두 실기기 간 E2E와 스토어 출시 점검

## 15. Git과 협업 규칙

- API 계약 변경 PR은 backend, iOS, Android 담당자 리뷰를 모두 받는다.
- enum/필드 변경은 OpenAPI와 fixture를 같은 PR에서 수정한다.
- 생성 코드와 수동 코드를 디렉터리로 분리하고 생성 파일을 직접 편집하지 않는다.
- 기능 브랜치는 짧게 유지하고, DB migration은 이미 배포된 파일을 수정하지 말고 새 파일을 추가한다.
- PR 완료 조건: 테스트, lint/format, 문서, 민감 정보 검사.
- `.env`, keystore, signing certificate, API key, 관리자 credential을 커밋하지 않는다.

## 16. 환경변수 초안

```env
SPRING_PROFILES_ACTIVE=local|staging|production
DATABASE_URL=...
DATABASE_USERNAME=...
DATABASE_PASSWORD=...
REDIS_URL=...
PLACES_PROVIDER=mock|kakao|google
KAKAO_REST_API_KEY=...
GOOGLE_PLACES_API_KEY=...
PUBLIC_WEB_URL=https://...
ALLOWED_WEB_ORIGINS=https://...
MIN_STAY_MINUTES=60
SEARCH_CACHE_SECONDS=180
ADMIN_AUTH_ISSUER=...
```

모바일 빌드 설정에는 공개 가능한 API base URL과 지도 SDK의 플랫폼 제한 키만 둔다. 서버 REST 키나 관리자 credential은 두지 않는다.

## 17. 플랫폼 담당 AI용 추가 프롬프트

### Spring AI에게

```text
SPRING_IOS_ANDROID_REBUILD_SPEC.md 전체를 기준으로 Spring 백엔드를 구현해라.
먼저 OpenAPI, 도메인 상태 전이, 권한별 Room 응답 DTO, PostgreSQL 제약조건을 제안하고 구현 순서를 보여라.
Java 21, Spring Boot, MVC, Validation, Data JPA, Flyway, WebClient, PostgreSQL, Testcontainers를 사용한다.
모듈형 모놀리스로 만들고 엔티티를 API에서 직접 반환하지 않는다.
추첨은 DB transaction/row lock/unique constraint로 동시성을 보장하고 SecureRandom을 사용한다.
공개 전 목적지 정보가 Room/share/navigation/로그 어디에도 나타나지 않는 통합 테스트를 가장 중요한 완료 조건으로 삼아라.
기존 API와 달라지는 부분은 구현 전에 명시하고 iOS/Android가 쓸 fixture JSON을 함께 만들어라.
```

### iOS AI에게

```text
SPRING_IOS_ANDROID_REBUILD_SPEC.md와 합의된 OpenAPI를 기준으로 iOS 앱을 구현해라.
SwiftUI, async/await, URLSession, Codable, Keychain, CoreLocation, Universal Links를 사용한다.
feature 단위 상태와 navigation을 구성하고 앱 재시작 뒤 방/활동 세션을 복구한다.
waiting/drawn polling은 background에서 중지하고 foreground 복귀 시 즉시 갱신한다.
위치는 foreground에서만 쓰며 서버가 reveal을 승인하기 전 목적지를 앱에서 추정하거나 표시하지 않는다.
서버 fixture 기반 decode test, 위치 권한 상태, 딥링크, 공개 전 좌표 비노출 UI test를 작성한다.
백엔드 계약이 불명확하면 임의 필드를 만들지 말고 OpenAPI 변경안을 먼저 제안한다.
```

### Android AI에게

```text
SPRING_IOS_ANDROID_REBUILD_SPEC.md와 합의된 OpenAPI를 기준으로 Android 앱을 구현해라.
Kotlin, Jetpack Compose, ViewModel/StateFlow, Coroutines, Retrofit/OkHttp 또는 생성 클라이언트, Kotlinx Serialization, Hilt, DataStore와 Android Keystore를 사용한다.
feature 단위 상태와 navigation을 구성하고 process death 뒤 방/활동 세션을 복구한다.
polling과 위치 업데이트는 lifecycle-aware하게 실행하고 background에서 중지한다.
서버 승인 전 목적지 좌표, 마커, 상세를 앱 메모리/로그/캐시에 보관하지 않는다.
MockWebServer fixture test, 위치 권한 상태, App Links, 공개 전 비노출 Compose UI test를 작성한다.
백엔드 계약이 불명확하면 임의 필드를 만들지 말고 OpenAPI 변경안을 먼저 제안한다.
```

## 18. Definition of Done

다음 조건을 모두 충족해야 네이티브 재구축 MVP가 완료된 것으로 본다.

- Spring, iOS, Android가 같은 OpenAPI와 상태 enum을 사용한다.
- iOS 방장/Android 참가자와 그 반대 조합의 친구 모드 E2E가 성공한다.
- OMYS 추천이 실제 provider에서 후보 검색, 조건 필터, 최종 검증 후 선정된다.
- 공개 전 목적지 누출 테스트가 API, 앱 UI, 로그, 공유 페이지에서 모두 통과한다.
- 위치 권한을 거절해도 앱이 멈추지 않고 수동 대안 또는 명확한 안내를 준다.
- 중복 요청과 동시 추첨에도 데이터가 일관된다.
- 위험한 미스터리 활동이 배포 목록에 없다.
- secret이 저장소와 모바일 번들에 없고 운영 기본 관리자 비밀번호가 없다.
- PostgreSQL migration, 백업, healthcheck, rate limit, 오류 관측이 준비되어 있다.
- 개인정보 처리방침, 위치 권한 문구, 앱스토어/플레이스토어 제출용 설명이 준비되어 있다.

---

현재 코드 참고 위치: `README.md`, `SERVICE_INTRO.md`, `backend/app/main.py`, `backend/app/models.py`, `backend/app/services.py`, `backend/app/places.py`, `frontend/src/lib/api.ts`, `frontend/src/pages`, `frontend/src/components`.
