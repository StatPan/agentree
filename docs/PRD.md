# Agentree PRD

> 목적: Agent 실행 트리를 Figma처럼 인피니트 캔버스로 시각화하고, 실시간 채팅으로 제어할 수 있는 풀스택 오픈소스 대시보드
> 기준일: 2026-04-06 (Phase 1 완료 기준으로 갱신)

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

opencode가 native하게 지원하지 않는 관계/메타데이터는 Agentree DB에 오버레이로 저장한다.
향후 opencode가 동일 기능을 지원하면 오버레이를 대체하거나 응용한다.

---

## 3. DB 역할

Agentree SQLite는 opencode가 모르는 것을 저장하는 **오버레이 레이어**다.

### 저장 대상

| 테이블 | 내용 |
|--------|------|
| `canvas_node` | 노드 위치 (x, y), 사용자 정의 레이블, pinned 여부 |
| `session_fork` | fork 관계 (하위 호환 유지) |
| `session_relation` | 일반화된 세션 간 관계 오버레이 |

### session_relation 관계 타입

| 타입 | 설명 |
|------|------|
| `fork` | fork된 세션 (session_fork의 일반화) |
| `linked` | 사용자가 수동으로 연결한 관계 |
| `detached` | 연결 해제된 관계 |
| `merged-view` | 병합 뷰로 묶인 관계 |

세션 상태(status, parent, messages)는 여전히 opencode가 source of truth.

---

## 4. 범위

### Phase 1 — 완료 ✓

- 인피니트 캔버스 (줌/팬/드래그)
- opencode session 트리 → 캔버스 노드 트리 자동 렌더링
- 노드 상태 배지 (running / done / failed / needs-permission / needs-answer)
- 노드 선택 → 사이드 패널에서 실시간 채팅으로 agent 제어
- `GET /global/event` SSE → 노드 상태 실시간 반영
- 노드 위치 드래그 → SQLite 영속화 (pinned)
- permission / question 승인 UI (인라인 + 플로팅 ApprovalQueue)
- fork 시각화 (FORK 배지, teal 점선 엣지, 포크 소스 표시)
- subtask 생성 UI
- opencode SDK 버전 호환성 어댑터 + 경고 표시
- 일반화된 session_relation 오버레이 모델 (DB + API + 엣지 스타일 기반)

### Phase 2 — 진행 예정

**Supervision 강화**

- SessionPanel 확장
  - 세션 메타데이터 블록 (model, provider, agent, cwd, token/cost)
  - 구조화된 파트 렌더링: `subtask`, `tool`, `file`, `patch`
  - 미사용 SSE 이벤트 처리: `message.part.updated`, `todo.updated`, `session.diff`, `command.executed`
- connect / disconnect / merge 관계 UI (session_relation 기반)

**캔버스 관계 표현**

- 관계 타입별 엣지 스타일 (linked: 인디고, merged-view: 바이올렛, detached: 회색 점선)
- 노드 간 수동 관계 연결/해제 UI

### Phase 3 — 향후

- 다중 오퍼레이터 (Figma 커서처럼 누가 어느 노드 보는지 표시)
- 노드 메모/태그
- 실행 히스토리 타임라인 (tool 호출, patch, diff 순서대로)
- 오픈소스 배포 (npm / Docker)

---

## 5. 아키텍처

```
apps/agentree/
├── src/
│   ├── client/            # React + React Flow
│   │   ├── canvas/        # 인피니트 캔버스 + 노드 렌더링
│   │   ├── panel/         # 사이드 패널 (채팅, 승인, 관계)
│   │   └── store/         # 실시간 상태 (Zustand)
│   └── server/            # Hono 서버
│       ├── routes/        # REST API (opencode SDK 프록시)
│       ├── sse/           # opencode SSE → 클라이언트 브로드캐스트
│       ├── opencode/      # opencode SDK 연동 + 호환성 어댑터
│       └── db/            # SQLite 오버레이 (canvas_node, session_relation)
├── drizzle/               # 마이그레이션
└── docs/
```

---

## 6. 데이터 모델

### canvas_node

| 컬럼 | 타입 | 설명 |
|------|------|------|
| session_id | text PK | opencode session ID |
| label | text | 사용자 정의 레이블 |
| canvas_x | real | 캔버스 X 위치 |
| canvas_y | real | 캔버스 Y 위치 |
| pinned | integer | 0/1 — 자동 레이아웃 대상 여부 |
| updated_at | text | ISO8601 |

### session_fork (하위 호환 유지)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| session_id | text PK | fork된 세션 ID |
| forked_from_session_id | text | 원본 세션 ID |
| created_at | text | ISO8601 |

### session_relation

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer PK | auto-increment |
| from_session_id | text | 소스 세션 (엣지 방향: 부모) |
| to_session_id | text | 타겟 세션 (엣지 방향: 자식/fork) |
| relation_type | text | `fork` \| `linked` \| `detached` \| `merged-view` |
| created_at | text | ISO8601 |

---

## 7. API

### 트리 조회

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/tree | 세션 목록 + 상태 + 캔버스 오버레이 + 관계 반환 |
| GET | /api/health | 서버 + opencode 연결 상태 |

### 세션 제어

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/session/:id | 세션 상세 |
| GET | /api/session/:id/messages | 메시지 히스토리 |
| POST | /api/session | 새 세션 생성 |
| POST | /api/session/:id/prompt | 프롬프트 전송 |
| POST | /api/session/:id/abort | 실행 중단 |
| POST | /api/session/:id/fork | 세션 fork (session_fork + session_relation 듀얼 라이트) |
| POST | /api/session/:id/subtask | 서브태스크 생성 |

### 승인 제어

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | /api/permission/:requestID/reply | permission 승인/거부 |
| POST | /api/question/:requestID/reply | question 답변 |
| POST | /api/question/:requestID/reject | question 거부 |

### 캔버스 상태

| 메서드 | 경로 | 설명 |
|--------|------|------|
| PATCH | /api/canvas/:id | 노드 위치/레이블/pinned 저장 |
| GET | /api/canvas/:id | 노드 캔버스 상태 조회 |

### 실시간

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/events | opencode SSE 클라이언트 브로드캐스트 |

---

## 8. 프론트 핵심 동작

### 캔버스

- React Flow 기반 인피니트 캔버스
- 초기 레이아웃: dagre 자동 배치 (rankdir: BT — 뿌리가 아래, 가지가 위)
- 노드 드래그 → SQLite 위치 저장 (pinned)
- SSE 이벤트 → 새 노드 실시간 추가
- recent / all 뷰 모드
- 디렉토리 기준 그룹 헤더

### 노드 상태

| 상태 | 색상 | 트리거 |
|------|------|--------|
| `running` | 초록 | `session.status` |
| `needs-permission` | 노랑 | `permission.asked` |
| `needs-answer` | 주황 | `question.asked` |
| `idle` | 파랑 | `session.idle` |
| `done` | 회색 | `session.status` (done) |
| `failed` | 빨강 | `session.error` |

### 엣지 스타일

| 조건 | 색상 | 선 스타일 | 애니메이션 |
|------|------|-----------|-----------|
| 기본 부모-자식 | `#374151` | 실선 | 없음 |
| fork 관계 | `#14b8a6` (teal) | `8 4` 점선 | 없음 |
| linked 관계 | `#818cf8` (indigo) | `4 2` 점선 | 없음 |
| merged-view | `#a78bfa` (violet) | 실선 | 없음 |
| detached | `#6b7280` (gray) | `2 6` 점선 | 없음 |
| needs-permission | 노랑 | 점선 | 있음 |
| needs-answer | 주황 | 점선 | 있음 |

### 사이드 패널

- 세션 메시지 히스토리 (현재: text/reasoning 파트)
- 채팅 입력 → prompt 전송
- abort 버튼
- permission / question 인라인 응답 UI
- 자식 세션 pending 항목 표시
- fork 소스 표시 및 네비게이션
- subtask / fork 생성 버튼

---

## 9. 비즈니스 모델

**라이선스: Apache-2.0**

현재 단계에서 AGPL/BSL은 과잉 대응이다. 이유:
- 로컬 실행 기반이라 클라우드 프로바이더 strip-mining 위협이 낮음
- 초기 채택 확산이 방어보다 중요한 시점
- Apache-2.0은 특허 방어 조항 포함 + 상표는 별도 보호

**상표: 공개 전 KIPO 출원 (9류 + 42류)**

오픈소스로 공개해도 "Agentree" 상표는 라이선스가 보호하지 않음. 출원일 기준으로 권리가 발생하므로, 공개 전 출원이 필요하다.

**수익화: 장기 오픈코어 방향 (현재는 미결)**

| 레이어 | 공개 여부 | 내용 |
|--------|-----------|------|
| 코어 | 오픈소스 (Apache-2.0) | 캔버스, 세션 제어, 오버레이 DB, SSE |
| 팀 레이어 | 유료 (향후, TBD) | 멀티 오퍼레이터, 권한 관리, hosted 연결 |

팀 기능 수요가 실제로 발생하는 시점에 오픈코어 경계를 설계한다. 지금 설계하면 수요보다 수익 구조를 먼저 상정하는 꼴이 됨.

**공개 전 체크리스트**
- [ ] KIPO 상표 출원 (9류 + 42류, 출원료 104,000원)
- [ ] `LICENSE` 파일 추가 (Apache-2.0)
- [ ] `.gitignore` 정리
- [ ] `README.md` 공개용으로 정리
- [ ] `.env` 계열 파일 제외 확인

---

## 10. 기술 스택

| 레이어 | 선택 | 이유 |
|--------|------|------|
| 프론트 | React + Vite | |
| 캔버스 | React Flow | 인피니트 캔버스, 노드 커스텀, 줌/팬 기본 제공 |
| 레이아웃 | dagre | 트리 자동 배치 |
| 상태관리 | Zustand | SSE 이벤트 → 캔버스 상태 연동 |
| 백엔드 | Hono (Node) | TypeScript-first, SSE 내장 |
| ORM | Drizzle | TypeScript 타입 안전 |
| DB | SQLite (WAL) | 오버레이 전용 — opencode가 session 상태의 source of truth |
| AI 엔진 | opencode SDK (`@opencode-ai/sdk`) | session 트리가 process 계층의 source of truth |
