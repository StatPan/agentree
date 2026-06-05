# Agentree

Figma-like infinite canvas for supervising live OpenCode agent session trees in real time.

## Stack
- Client: React 19 + @xyflow/react (canvas), Zustand (state), Vite 8
- Server: Hono (Node), Drizzle ORM, SQLite (~/.agentree/agentree.db)
- SDK: @opencode-ai/sdk
- CLI: `npx agentree` or `npm install -g agentree`

## Architecture Principles
- OpenCode is source of truth for sessions/execution state
- Agentree-specific metadata lives in local DB overlays (canvas_node, session_fork, project tables)
- SDK version differences isolated behind src/server/opencode/* adapter/normalization code
- opencode session/message data is read-only; overlay mutations go through Agentree DB tables

## Current State
- Phase 0-5 complete
- App flow: HomeScreen (project cards) → per-project canvas → session panel
- Projects are auto-created from directory keys, stored in DB, names editable
- activeProjectKey = project UUID (not directory string)
- SessionPanel: dir/created/agent/model/cwd/cost metadata, Share/Unshare UI
- session_relation is sole source of fork relations (session_fork writes stopped)
- PR #11 merged (project creation + canvas filtering)

## Active Objective
Phase 6: `GET /api/agent/tree` 감독용 조회 API + SSE 재연결/오류복구 마무리

### Candidates (Future Roadmap):
- Project v2: manual session reassignment, colors/icons, filtering
- 추가 agent-facing compact API는 현재 Phase 6 acceptance 이후 재평가

## PM Role

이 세션(PM)의 역할은 분석·계획·검토다. 코드 편집은 Dev 세션에 위임한다.

- **분석**: 관련 파일을 Read로 읽어 현재 구조와 맥락을 파악한다
- **PRD 수신**: 오케스트레이터로부터 PRD(`~/workspace/statpan_docs/projects/_ORCHESTRATION/templates/PRD.md` 양식)를 받는다. PRD에는 목표 상태·Acceptance Criteria·Scope 경계가 포함된다.
- **Tech Spec 작성**: PRD를 기반으로 `~/workspace/statpan_docs/projects/_ORCHESTRATION/templates/TECH_SPEC.md` 양식에 맞춰 Tech Spec을 작성한다. 저장 위치: `~/workspace/statpan_docs/projects/agentree/TechSpecs/`
- **Dev 세션 호출**: Tech Spec 전문을 전달한다. `cd {project_dir} && claude -p "$(cat {tech_spec_path})" --model sonnet --output-format json --dangerously-skip-permissions`
- **결과 검토**: Tech Spec의 Acceptance Criteria 항목별 evidence를 확인한다. evidence 없는 완료 보고는 불인정한다.

코드를 직접 Edit/Write/Bash로 수정하지 않는다.

## Key Files
- src/server/db/schema.ts -- DB tables
- src/server/routes/session.ts, canvas.ts, approval.ts, tree.ts, project.ts
- src/server/opencode/types.ts, normalize.ts, compat.ts
- src/client/store/agentStore.ts -- SSE event handling, Project type, appView
- src/client/HomeScreen.tsx
- src/client/canvas/AgentCanvas.tsx, AgentNode.tsx, ProjectTabBar.tsx
- src/client/panel/SessionPanel.tsx, ApprovalQueue.tsx

## Decisions Made
- opencode data is read-only, never mutated directly
- SQLite for local persistence (not Postgres)
- SSE for real-time updates (not WebSocket)
- Project concept is DB-backed UUID, not ephemeral directory grouping

## Dependencies
- opencode SDK (@opencode-ai/sdk) -- upstream API surface

## Future Roadmap
- Project v2: manual session reassignment, colors/icons, filtering
- 추가 compact API / agent-facing API는 Phase 6 종료 후 별도 판단
