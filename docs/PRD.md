# Agentree PRD

> 목적: Agent 실행 트리를 Figma처럼 인피니트 캔버스로 시각화하고, 실시간 채팅으로 제어할 수 있는 풀스택 오픈소스 대시보드
> 기준일: 2026-04-03

---

## 1. 핵심 컨셉

Figma가 디자인 오브젝트를 캔버스에서 동시에 다루듯이, Agent를 캔버스에서 다룬다.

- process → subprocess → thread 계층이 캔버스 위에 폭포처럼 펼쳐짐
- 줌인/아웃, 드래그로 전체 실행 트리를 탐색
- 노드 선택 → 실시간 채팅으로 해당 agent에 직접 지시
- 파생 agent/thread가 생성될 때 캔버스에 실시간으로 노드 추가

시장에 없는 이유: agent 실행이 대부분 CLI/로그 기반이라 실행 트리를 시각적으로 탐색하는 툴 자체가 없음.

---

## 2. 핵심 발견 — opencode session 트리가 백엔드

opencode SDK를 분석한 결과, 계층 구조가 이미 내장되어 있음:

- `GET /session` — 전체 세션 목록
- `GET /session/{id}/children` — 자식 세션 조회 (subprocess/thread에 해당)
- `POST /session/{id}/fork` — 세션 파생 (thread 생성에 해당)
- `GET /global/event` SSE — 전체 이벤트 실시간 스트림

따라서 agentproc의 `process → subprocess → thread` 계층은 **opencode session 트리에 직접 매핑**된다.

```
opencode session (root)          ← process
  └─ /session/{id}/children      ← subprocess
       └─ fork된 session         ← thread
```

dashboard DB(SQLite)는 opencode가 모르는 것만 저장한다:
- 캔버스 노드 위치 (x, y)
- 사용자 정의 레이블
- 캔버스 뷰포트 상태

---

## 3. 범위

### Phase 1 — 1인 운용 기준 (v0.1)

- 인피니트 캔버스 (줌/팬/드래그)
- opencode session 트리 → 캔버스 노드 트리 자동 렌더링
- 노드 상태 배지 (running / done / failed / needs-input)
- 노드 선택 → 사이드 패널에서 실시간 채팅으로 agent 제어
- `GET /global/event` SSE → 노드 상태 실시간 반영
- SQLite — 캔버스 레이아웃 상태만 저장

### Phase 2 — 확장

- 다중 오퍼레이터 (Figma 커서처럼 누가 어느 노드 보는지 표시)
- 노드 메모/태그
- 실행 히스토리 타임라인
- 오픈소스 배포 (npm / Docker)

---

## 4. 아키텍처

```
apps/agentproc-dashboard/
├── src/
│   ├── frontend/          # React + React Flow
│   │   ├── canvas/        # 인피니트 캔버스 + 노드 렌더링
│   │   ├── panel/         # 사이드 패널 (채팅, 디테일)
│   │   └── store/         # 실시간 상태 (Zustand)
│   └── backend/           # Hono 서버
│       ├── routes/        # REST API (opencode SDK 프록시)
│       ├── sse/           # opencode SSE → 클라이언트 브로드캐스트
│       ├── opencode/      # opencode SDK 연동
│       └── db/            # SQLite (캔버스 상태만)
├── drizzle/               # 마이그레이션
└── docs/
```

---

## 5. 데이터 모델

### canvas_node (SQLite — dashboard 전용)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| session_id | text | PK — opencode session ID와 동일 |
| label | text | 사용자 정의 레이블 (없으면 session title 사용) |
| canvas_x | real | 캔버스 X 위치 |
| canvas_y | real | 캔버스 Y 위치 |
| pinned | integer | 0/1 — 자동 레이아웃 대상 여부 |
| updated_at | text | ISO8601 |

세션 상태(status, parent, messages)는 모두 opencode가 source of truth.

---

## 6. API

dashboard Hono 서버는 주로 opencode SDK의 프록시 + SSE 브로드캐스터 역할.

### 트리 조회

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/tree | opencode `/session` + `/session/{id}/children` 재귀 조회 → 트리 반환 |

### 채팅 제어

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | /api/session/:id/message | opencode `/session/{id}/message` 프록시 |
| GET | /api/session/:id/message | 메시지 히스토리 |
| POST | /api/session/:id/abort | 실행 중단 |
| POST | /api/session/:id/fork | 자식 session 파생 |

### 캔버스 상태

| 메서드 | 경로 | 설명 |
|--------|------|------|
| PATCH | /api/canvas/:id | 노드 위치/레이블 저장 (SQLite) |

### 실시간

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/events | opencode SSE를 구독해 클라이언트에 브로드캐스트 |

---

## 7. 프론트 핵심 동작

### 캔버스

- React Flow 기반 인피니트 캔버스
- 초기 레이아웃: dagre 자동 배치 (아래→위, `rankdir: BT` — 뿌리가 아래, 가지가 위로 뻗음)
- 노드를 직접 드래그하면 SQLite에 위치 저장 (pinned 처리)
- SSE 이벤트로 새 session 생성 감지 → 노드 애니메이션 추가

### 노드 상태

| 상태 | 색상 | opencode 이벤트 | 설명 |
|------|------|----------------|------|
| `running` | 초록 | `EventSessionStatus` | 실행 중 |
| `needs-permission` | 노랑 | `EventPermissionAsked` | 도구 실행 승인 대기 |
| `needs-answer` | 주황 | `EventQuestionAsked` | 질문 답변 대기 |
| `idle` | 파랑 | `EventSessionIdle` | 대기 중 |
| `done` | 회색 | `EventSessionStatus` | 완료 |
| `failed` | 빨강 | `EventSessionError` | 오류 |

```
┌─────────────────────────────┐
│ [needs-permission]  worker-1 │
│ summarize docs task          │
│ ● edit /src/index.ts 허용?   │
│ [허용]  [거부]               │
└─────────────────────────────┘
```

- 클릭 → 오른쪽 사이드 패널
- `needs-permission` / `needs-answer` 상태면 노드 안에 인라인 액션 버튼 표시

### 엣지(연결선) 상태

부모↔자식 세션 연결선이 현재 상호작용 상태를 시각화한다.

| 상태 | 표현 | 조건 |
|------|------|------|
| 기본 | 정적 실선 | 자식이 독립 실행 중 |
| 승인 요청 중 | 점선 + 위→아래 애니메이션 (자식→부모 방향) | 자식 `needs-permission` |
| 질문 대기 중 | 주황 점선 + 애니메이션 | 자식 `needs-answer` |
| 응답 내려보내는 중 | 실선 + 위→아래 역방향 애니메이션 | 부모가 reply 처리 직후 |
| 완료 | 회색 실선 | 자식 `done` |

React Flow `animated` + 커스텀 엣지 컴포넌트로 구현.

### 사이드 패널

- 해당 session의 메시지 히스토리
- 채팅 입력 → `POST /api/session/:id/message` → opencode로 전달
- SSE로 응답 실시간 스트리밍
- Fork 버튼 → 자식 session 생성 → 캔버스에 새 노드 추가

---

## 8. 기술 스택

| 레이어 | 선택 | 이유 |
|--------|------|------|
| 프론트 | React + Vite | |
| 캔버스 | React Flow | 인피니트 캔버스, 노드 커스텀, 줌/팬 기본 제공 |
| 레이아웃 | dagre | 트리 자동 배치 |
| 상태관리 | Zustand | SSE 이벤트 → 캔버스 상태 연동 |
| 백엔드 | Hono (Node) | TypeScript-first, SSE 내장, opencode SDK 호환 |
| ORM | Drizzle | TypeScript 타입 안전 |
| DB | SQLite (WAL) | 캔버스 레이아웃만 저장 — opencode가 이미 SQLite 사용 |
| AI 엔진 | opencode SDK | session 트리가 process 계층의 source of truth |

SQLite를 선택한 이유: 실제 동시 write 부하는 opencode 내부에서 처리됨. dashboard DB는 캔버스 위치만 저장하므로 SQLite WAL 모드로 충분.

---

## 9. libs/agentproc과의 관계

| | libs/agentproc | apps/agentproc-dashboard |
|--|--|--|
| 역할 | CLI 런타임 (`aproc`) | 풀스택 서비스 (UI + API + SQLite) |
| 상태 저장 | 파일시스템 | opencode session 트리 + SQLite(캔버스) |
| UI | 기본 workbench HTML | React Flow 캔버스 |
| 실시간 | 없음 | SSE |
| 제어 | CLI 명령 | 채팅 + 캔버스 |

dashboard가 메인 서비스. aproc CLI는 로컬 트리거/디버그 용도로 유지.

---

## 10. 다음 작업

1. Hono + opencode SDK 연결 + `/api/tree` 엔드포인트
2. SQLite + Drizzle `canvas_node` 테이블 세팅
3. React Flow 캔버스 기본 구조 + dagre 레이아웃
4. SSE 파이프라인 (opencode global event → Zustand → 캔버스)
5. 사이드 패널 채팅 UI
