# Agentree — Codex Handoff

## What is this project?

**Agentree** is an open-source, Figma-like infinite canvas for visualizing and controlling AI agent process trees in real-time. It connects to a running **opencode** instance (an AI agent execution engine) and renders its session hierarchy as an interactive node graph.

Key concept: just as Figma shows multiple design objects on a shared canvas, Agentree shows opencode sessions (process → subprocess → thread) as nodes on an infinite canvas with zoom/pan, real-time status updates, and inline chat control per node.

## Current state

Phase 1 (scaffolding) and Phase 2 (core implementation) are complete. The app starts and runs. What remains is Phase 3 integration work listed below.

### What works today

- `pnpm run dev` — starts both Hono server (`:3001`) and Vite dev server (`:5173`)
- `GET /api/health` → `{"ok":true}`
- `GET /api/tree` → proxies to opencode, returns flat session list
- `GET /api/events` → SSE stream re-broadcasting opencode global events
- `POST /api/session/:id/prompt` — send message to session
- `POST /api/session/:id/abort` — abort session
- `POST /api/permission/:requestID/reply` — approve/deny tool permission
- `POST /api/question/:requestID/reply` / `reject` — answer/reject question
- React Flow canvas renders with dagre BT layout (tree grows upward)
- Zustand store handles SSE events and updates node status + color
- Right side panel appears on node click (placeholder text)

### What is stubbed / not yet wired

1. **`PATCH /api/canvas/:id`** — position save is a `console.log` stub; DB import is commented out with `TODO`
2. **Side panel chat UI** — shows placeholder text, no real chat
3. **Permission/question approval UI** — no inline buttons on nodes yet
4. **DB migration on startup** — `drizzle-kit generate` has been run, but `db:migrate` has not

---

## Tech stack

| Layer | Package | Version |
|-------|---------|---------|
| Frontend | React | 19.2.4 |
| Canvas | @xyflow/react | 12.10.2 |
| State | zustand | 5.0.12 |
| Layout | @dagrejs/dagre | 3.0.0 |
| Build | Vite | 8.0.3 |
| Backend | hono + @hono/node-server | 4.12.10 / 1.19.12 |
| AI engine SDK | @opencode-ai/sdk | 1.3.13 |
| DB driver | better-sqlite3 | 12.8.0 |
| ORM | drizzle-orm + drizzle-kit | 0.45.2 / 0.31.10 |
| Runtime | tsx (watch mode) | 4.21.0 |
| TS | typescript | 6.0.2 |

- **Package manager**: pnpm
- **Module system**: `"type": "module"` — all server imports use `.js` extensions; Vite client files do not need extensions
- **Ports**: Vite dev `:5173`, Hono `:3001`, Vite proxies `/api/*` → `:3001`
- **opencode URL**: `OPENCODE_API_URL` env var, defaults to `http://localhost:6543`
- **DB path**: `DB_PATH` env var, defaults to `./agentree.db` (project root)

---

## File structure

```
agentree/
├── src/
│   ├── client/
│   │   ├── main.tsx                  # React entry
│   │   ├── App.tsx                   # Root layout (canvas + side panel)
│   │   ├── vite-env.d.ts             # Vite type declarations
│   │   ├── canvas/
│   │   │   ├── AgentCanvas.tsx       # ReactFlow canvas, fetches tree, subscribes SSE
│   │   │   ├── AgentNode.tsx         # Custom node (status dot + color border)
│   │   │   └── AgentEdge.tsx         # Custom edge (straight path)
│   │   ├── store/
│   │   │   └── agentStore.ts         # Zustand: nodes/edges/selectedSession + applyEvent
│   │   └── panel/                    # (empty) — chat panel goes here
│   └── server/
│       ├── index.ts                  # Hono app, mounts all routes, starts SSE listener
│       ├── opencode/
│       │   └── client.ts             # Singleton opencode SDK client
│       ├── routes/
│       │   ├── tree.ts               # GET /api/tree
│       │   ├── session.ts            # GET|POST /api/session/:id
│       │   ├── canvas.ts             # PATCH /api/canvas/:id (STUB — see Task 1)
│       │   └── approval.ts           # POST /api/permission/:id/reply, question reply/reject
│       ├── sse/
│       │   └── broadcaster.ts        # opencode SSE → fan-out to browser clients
│       └── db/
│           ├── schema.ts             # Drizzle: canvas_node table definition
│           └── index.ts              # DB init (WAL), saveCanvasNode/getCanvasNode helpers
├── drizzle/
│   └── 0000_cynical_sauron.sql       # Generated migration (not yet applied)
├── drizzle.config.ts                 # Drizzle Kit config
├── package.json
├── tsconfig.json                     # Server TS config (rootDir: src/server)
├── tsconfig.client.json              # Client TS config (noEmit, jsx: react-jsx)
├── vite.config.ts                    # Vite config (proxy /api/* → :3001)
└── index.html                        # Vite entry HTML
```

---

## Data model

Single SQLite table at `agentree.db` (project root):

```sql
CREATE TABLE canvas_node (
  session_id TEXT PRIMARY KEY,   -- opencode session ID
  label      TEXT,               -- user-defined label
  canvas_x   REAL DEFAULT 0,     -- canvas X position
  canvas_y   REAL DEFAULT 0,     -- canvas Y position
  pinned     INTEGER DEFAULT 0,  -- 0 = auto-layout by dagre, 1 = user-pinned
  updated_at TEXT                -- ISO8601 timestamp
)
```

---

## opencode SDK usage

```ts
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'
const client = createOpencodeClient({ baseUrl: 'http://localhost:6543' })

// Sessions
client.session.list()                                    // all sessions
client.session.get({ sessionID })                        // one session
client.session.children({ sessionID })                   // child sessions
client.session.prompt({ sessionID, parts: [{ type: 'text', text }] })
client.session.abort({ sessionID })

// SSE — result.stream is an AsyncGenerator
const result = await client.global.event()
for await (const msg of result.stream) {
  const payload = msg.payload  // type: Event
}

// Permissions
client.permission.list()
client.permission.reply({ requestID, reply: 'once' | 'always' | 'reject', message? })

// Questions
client.question.list()
client.question.reply({ requestID, answers: [{ questionID, value }] })
client.question.reject({ requestID })
```

### Key event types from SSE

```ts
// msg.payload.type can be:
'session.created'      // properties: { sessionID, info: Session }
'session.updated'      // properties: { sessionID, info: Session }
'session.deleted'      // properties: { sessionID, info: Session }
'session.status'       // properties: { sessionID, status: string }   → node turns green
'session.idle'         // properties: { sessionID }                   → node turns blue
'session.error'        // properties: { sessionID, error: string }    → node turns red
'permission.asked'     // properties: PermissionRequest               → node turns yellow
'permission.replied'   // properties: ...                             → node turns green
'question.asked'       // properties: QuestionRequest                 → node turns orange
'question.replied'     // properties: ...                             → node turns green
```

### Node status → color

| Status | Color | Hex |
|--------|-------|-----|
| running | green | `#22c55e` |
| needs-permission | yellow | `#eab308` |
| needs-answer | orange | `#f97316` |
| idle | blue | `#3b82f6` |
| done | gray | `#6b7280` |
| failed | red | `#ef4444` |

---

## Remaining tasks (Phase 3)

### Task 1 — Wire canvas position persistence (small, ~15 min)

**File**: `src/server/routes/canvas.ts`

Remove the stub and import the DB helper:

```ts
import { Hono } from 'hono'
import { saveCanvasNode } from '../db/index.js'

export const canvasRouter = new Hono()

canvasRouter.patch('/api/canvas/:id', async (c) => {
  const sessionID = c.req.param('id')
  const body = await c.req.json<{ x?: number; y?: number; label?: string; pinned?: boolean }>()
  await saveCanvasNode(sessionID, body)
  return c.json({ ok: true, sessionID })
})
```

Also run DB migration on first start. In `src/server/index.ts`, add before `serve(...)`:

```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './db/index.js'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
migrate(db, { migrationsFolder: join(__dirname, '..', '..', 'drizzle') })
```

Also: wire canvas position save on node drag in `AgentCanvas.tsx` — use ReactFlow's `onNodeDragStop` callback:

```tsx
<ReactFlow
  ...
  onNodeDragStop={(_, node) => {
    fetch(`/api/canvas/${node.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: node.position.x, y: node.position.y, pinned: true }),
    })
    // Also mark node as pinned in store so dagre doesn't override it
  }}
/>
```

Add `pinned` flag to `AgentNodeData` in `agentStore.ts` so dagre skips pinned nodes during re-layout.

---

### Task 2 — Side panel chat UI (medium, ~1 hour)

**Files to create**: `src/client/panel/SessionPanel.tsx`

The panel shows:
1. Session title + status badge at top
2. Scrollable message history (fetch from `GET /api/session/:id` messages — opencode stores them)
3. Text input at bottom to send a new prompt (`POST /api/session/:id/prompt`)
4. Abort button

Wire it in `App.tsx` — replace the placeholder `<div>` with `<SessionPanel sessionId={selectedSessionId} />`.

For message history, opencode returns messages via `client.session.messages({ sessionID })` — expose this as `GET /api/session/:id/messages` in `src/server/routes/session.ts`.

Style: dark theme (background `#111`), monospace font for message content, match the canvas color scheme.

---

### Task 3 — Permission/question approval inline UI (medium, ~1 hour)

When a node has status `needs-permission` or `needs-answer`, show inline action buttons inside the side panel (or as a floating overlay on the node).

**Permission** (`needs-permission`):
```
[Allow once]  [Always allow]  [Deny]
```
Calls `POST /api/permission/:requestID/reply` with `{ reply: 'once' | 'always' | 'reject' }`.

**Question** (`needs-answer`):
Show the question text and an input field.
Calls `POST /api/question/:requestID/reply` with `{ answers: [{ questionID, value }] }` or `POST /api/question/:requestID/reject`.

To get the pending permission/question for a session: the SSE event `permission.asked` and `question.asked` carry the full request object. Store `pendingPermission` and `pendingQuestion` per session ID in `agentStore.ts`.

---

### Task 4 — Edge animation for approval flows (small, ~30 min)

When a node has `needs-permission` or `needs-answer`, animate its parent edge to show the request bubbling upward (child → parent direction).

In `agentStore.ts`, after `updateNodeStatus`, also update the corresponding edges:

```ts
// When child needs permission: animate edge from child to parent
set((state) => ({
  edges: state.edges.map((e) =>
    e.target === sessionId
      ? { ...e, animated: true, style: { stroke: '#eab308', strokeDasharray: '5 3' } }
      : e
  ),
}))
```

Reset edge animation when status changes back to `running`/`idle`.

---

## How to run

```bash
cd /path/to/agentree
pnpm install          # if first time
pnpm run dev          # starts both Vite :5173 and Hono :3001 concurrently

# opencode must be running separately on :6543
# or set OPENCODE_API_URL=http://your-opencode-host
```

## How to verify

```bash
curl http://localhost:3001/api/health    # → {"ok":true}
curl http://localhost:3001/api/tree      # → [] or session list (requires opencode running)
```

Browser: `http://localhost:5173` — should render the canvas. If opencode is running, nodes will appear automatically.
