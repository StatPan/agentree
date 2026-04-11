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
Phase 6: TBD

### Candidates (Future Roadmap):
- Supervisor agent support (compact /api/tree for agent consumption)
- Project v2: manual session reassignment, colors/icons, filtering

## PM Role

이 세션(PM)의 역할은 분석·계획·검토다. 코드 편집은 Dev 세션에 위임한다.

- **분석**: 관련 파일을 Read로 읽어 현재 구조와 맥락을 파악한다
- **스펙 작성**: 대상 파일·변경 내용·이유·완료 기준을 포함한 구현 스펙을 작성한다
- **Dev 세션 호출**: `cd {project_dir} && claude -p "{스펙}" --model sonnet --output-format json --dangerously-skip-permissions`
- **결과 검토**: 변경된 파일을 Read로 확인하여 스펙 준수 여부와 코드 품질을 검토한다

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
- Supervisor agent support (compact /api/tree for agent consumption)
- Project v2: manual session reassignment, colors/icons, filtering
