# Agentree

> Figma-like infinite canvas for visualizing and controlling AI agent trees in real-time.

Agentree lets you see your agent processes the way Figma lets you see design objects — on an infinite canvas, live, with full control.

## What it does

- **Infinite canvas** — zoom in/out, drag, explore your entire agent process tree
- **Live tree** — subprocess and thread nodes appear as they spawn, connected by animated edges
- **Real-time control** — click any node, chat with that agent directly from the panel
- **Approval flows** — when an agent needs permission or asks a question, the edge lights up and you approve/deny inline
- **Event-driven** — no polling, everything reacts to opencode SSE events

## How it works

Agentree sits on top of [opencode](https://opencode.ai) and uses its session tree as the source of truth.

```
opencode session (root process)
  └─ /session/{id}/children    → subprocess nodes
       └─ forked sessions      → thread nodes
```

Each node on the canvas = one opencode session. The canvas just visualizes what opencode already knows, plus stores node positions locally in SQLite.

## Stack

- **Canvas** — React + React Flow (infinite canvas, custom nodes/edges)
- **Layout** — dagre `rankdir: BT` (roots at bottom, branches grow upward)
- **Backend** — Hono + opencode SDK
- **DB** — SQLite (canvas layout only — opencode owns session state)
- **Real-time** — opencode `GET /global/event` SSE

## Status

🌱 Early development. PRD in [`docs/PRD.md`](docs/PRD.md).

## License

MIT
