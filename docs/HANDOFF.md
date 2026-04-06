# Agentree Handoff

Last updated: 2026-04-06

---

## Project context

Agentree is a Figma-like infinite canvas for supervising live `opencode` session trees.

- **Client** — React + React Flow canvas, Zustand store, side panel controls
- **Server** — Hono API that proxies `opencode`, rebroadcasts SSE, and stores overlay metadata in SQLite

Core principle: `opencode` is the source of truth for sessions and execution state. Agentree only stores what `opencode` doesn't know — canvas positions, custom labels, and session relations.

---

## Architecture

```
apps/agentree/
├── src/
│   ├── client/
│   │   ├── canvas/          # AgentCanvas, AgentNode, AgentEdge, GroupHeaderNode
│   │   ├── panel/           # SessionPanel, ApprovalQueue, SubtaskDialog
│   │   └── store/           # agentStore.ts — Zustand, SSE apply, graph build
│   └── server/
│       ├── routes/          # tree, session, canvas, approval, relation, system
│       ├── sse/             # broadcaster.ts — opencode SSE → client broadcast
│       ├── opencode/        # SDK adapter + compat layer + normalizer
│       └── db/              # schema.ts, index.ts — SQLite overlay
├── drizzle/                 # migrations
└── docs/
```

---

## Current state — Phase 1 + Phase 2 complete

### Canvas

- Infinite canvas with zoom/pan (React Flow)
- dagre auto-layout (`rankdir: BT` — roots at bottom, branches grow upward)
- Directory-based group headers
- Recent / All view modes
- Node drag → SQLite position persist (`canvas_node.pinned`)
- Auto-layout skips pinned nodes
- Real-time node addition/update via SSE

### Node states and edge styles

| State | Color | Trigger |
|-------|-------|---------|
| `running` | green | `session.status` |
| `needs-permission` | yellow | `permission.asked` |
| `needs-answer` | orange | `question.asked` |
| `idle` | blue | `session.idle` |
| `done` | gray | `session.status` done |
| `failed` | red | `session.error` |

| Relation | Edge color | Dash |
|----------|-----------|------|
| parent-child (default) | `#374151` | solid |
| `fork` | `#14b8a6` teal | `8 4` |
| `linked` | `#818cf8` indigo | `4 2` |
| `merged-view` | `#a78bfa` violet | solid |
| `detached` | `#6b7280` gray | `2 6` |
| `needs-permission` | yellow | animated |
| `needs-answer` | orange | animated |

### Session panel

Renders the selected session. Contains:

- Header: title, session ID, status badge
- Fork source banner + navigation
- `session.diff` hint (if fired)
- Metadata block: model, provider, cwd, total cost, total tokens (derived from AssistantMessage fields — no extra API call)
- Action buttons: Spawn subtask, Fork session
- Inline permission/question approval UI
- Child sessions waiting (permission/question) with inline reply controls
- Todo list — collapsible, from `todo.updated` SSE
- **Relations section** — shows non-fork relations to/from this session; `[+ Link]` form to add `linked`/`merged-view`/`detached` relations; `×` to delete; creating a relation also adds the corresponding edge on the canvas
- Message history — structured part rendering for all 12 SDK part types:
  - `text` — monospace pre-wrap
  - `reasoning` — italic, muted, `⟳` prefix
  - `tool` — pill + state dot (pending/running/completed/error) + collapsible output
  - `patch` — file list with `+N`/`-N`
  - `subtask` — teal left border, agent name
  - `file` — MIME badge; image thumbnail for `image/*`
  - `step-finish` — cost/token summary line (right-aligned, 10px)
  - `agent` — `↳ agent: {name}`, italic
  - `retry` — `⚠ retry #{n}: {error}` in orange
  - `compaction`, `step-start`, `snapshot` — filtered (noise)
  - unknown types — `[{type}]` fallback, never throws
- Live message refresh — 600ms debounce on `lastActivityBySession` SSE activity
- Prompt input + Send / Abort

### Approval queue

`ApprovalQueue.tsx` — floating overlay showing all sessions with pending permission/question across the entire canvas (not just the selected one).

### SSE event coverage in store (`applyEvent`)

| Event | Handler |
|-------|---------|
| `session.status` | status → `running` |
| `session.idle` | status → `idle`, clears `lastActivity` |
| `session.error` | status → `failed` |
| `permission.asked/updated` | status → `needs-permission`, stores payload |
| `question.asked/updated` | status → `needs-answer`, stores payload |
| `permission.replied` | clears pending permission |
| `question.replied/rejected` | clears pending question |
| `message.part.delta/updated` | updates `lastActivityBySession` (triggers panel refresh) |
| `session.created/updated` | updates session list, rebuilds graph |
| `session.deleted` | removes session from all store maps |
| `todo.updated` | updates `todosBySession[sessionId]` |
| `session.diff` | updates `diffBySession[sessionId]` |
| `command.executed` | updates `lastActivityBySession` (triggers panel refresh) |

### DB overlay tables

| Table | Purpose |
|-------|---------|
| `canvas_node` | node position (x, y), custom label, pinned flag |
| `session_fork` | legacy fork lineage (kept for backward compat) |
| `session_relation` | generalized relation overlay: `fork`/`linked`/`detached`/`merged-view` |

### API surface

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | server liveness |
| GET | `/api/tree` | sessions + status + canvas overlay + relations |
| GET | `/api/events` | SSE broadcast from opencode |
| GET | `/api/session/:id` | session detail |
| GET | `/api/session/:id/messages` | message history (`?limit=N`) |
| POST | `/api/session` | create session |
| POST | `/api/session/:id/prompt` | send prompt |
| POST | `/api/session/:id/abort` | abort |
| POST | `/api/session/:id/fork` | fork — dual-writes `session_fork` + `session_relation` |
| POST | `/api/session/:id/subtask` | create subtask |
| POST | `/api/permission/:id/reply` | approve/deny permission |
| POST | `/api/question/:id/reply` | answer question |
| POST | `/api/question/:id/reject` | reject question |
| PATCH | `/api/canvas/:id` | save node position/label/pinned |
| GET | `/api/canvas/:id` | get canvas state |
| POST | `/api/relation` | create `linked`/`merged-view`/`detached` relation |
| DELETE | `/api/relation/:id` | delete relation |
| GET | `/api/system/compat` | opencode SDK compat report |

---

## Release checklist status

| Item | Status |
|------|--------|
| `LICENSE` (Apache-2.0) | ✅ added |
| `.gitignore` — `.env.*`, `*.db*`, `node_modules/`, `dist/` | ✅ done |
| `README.md` — Apache-2.0 license line | ✅ fixed |
| README public cleanup — hardcoded `/home/statpan/...` path, default password in example | ✅ done |
| KIPO 상표 출원 (9류 + 42류, 104,000원) | ❌ manual |

---

## Remaining work

### Must-do before public release

**KIPO trademark filing** — "Agentree", 9류 + 42류, 출원료 104,000원. Must file before public GitHub push.

### Phase 3 (post-release)

| Feature | Notes |
|---------|-------|
| Canvas drag-to-connect | drag from node → another node → pick relation type |
| Multi-operator cursors | Figma-style presence — who is watching which node |
| Node memo / tags | freeform annotations per node |
| Execution history timeline | tool calls, patches, diffs in order |
| npm / Docker packaging | `npm create agentree`, or `docker run` one-liner |

---

## Key file reference

### Server

| File | Purpose |
|------|---------|
| `src/server/index.ts` | Hono app, router registration, migration |
| `src/server/routes/tree.ts` | GET /api/tree |
| `src/server/routes/session.ts` | session CRUD + fork + subtask |
| `src/server/routes/relation.ts` | POST/DELETE /api/relation |
| `src/server/routes/canvas.ts` | PATCH/GET /api/canvas/:id |
| `src/server/routes/approval.ts` | permission + question reply |
| `src/server/sse/broadcaster.ts` | opencode SSE → client rebroadcast |
| `src/server/opencode/index.ts` | adapter entry point |
| `src/server/opencode/normalize.ts` | SDK response normalization |
| `src/server/opencode/compat.ts` | version compat detection |
| `src/server/db/schema.ts` | Drizzle schema |
| `src/server/db/index.ts` | DB query functions |

### Client

| File | Purpose |
|------|---------|
| `src/client/store/agentStore.ts` | all client state — graph build, SSE apply, relations |
| `src/client/canvas/AgentCanvas.tsx` | canvas root, SSE subscription, tree reload |
| `src/client/canvas/AgentNode.tsx` | node component |
| `src/client/canvas/AgentEdge.tsx` | edge component |
| `src/client/panel/SessionPanel.tsx` | full session side panel |
| `src/client/panel/ApprovalQueue.tsx` | floating approval overlay |
| `src/client/panel/SubtaskDialog.tsx` | subtask creation modal |
| `src/client/App.tsx` | root layout |

---

## Quick verification

```bash
pnpm run build          # must pass with zero TS errors

pnpm run dev            # start dev server (requires opencode running at localhost:6543)

curl http://localhost:3001/api/health
curl http://localhost:3001/api/tree | jq '.relations'
```

Browser checklist:
- nodes load on canvas
- selecting a session shows metadata block (model / cwd / cost)
- tool call parts are collapsible in the panel
- `[+ Link]` in Relations section creates an edge between two sessions with the correct color/dash
- `×` on a relation removes the edge
- permission/question edges animate; inline approval clears them
- dragging a node persists position after reload
