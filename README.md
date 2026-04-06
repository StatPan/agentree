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

OpenCode integration notes and supervision source map live in [`docs/OPENCODE_INTEGRATION.md`](docs/OPENCODE_INTEGRATION.md).

## Run opencode with Docker

Agentree expects a running `opencode serve` instance at `http://localhost:6543`.

1. Copy the example env file.
2. Start the container.
3. Run Agentree locally with `pnpm run dev`.

```bash
cd agentree
cp .env.opencode.example .env.opencode
# edit .env.opencode — set OPENCODE_SERVER_PASSWORD to a strong secret
docker compose --env-file .env.opencode -f docker-compose.opencode.yml up -d --build
export OPENCODE_SERVER_USERNAME=opencode
export OPENCODE_SERVER_PASSWORD=<your-password>
pnpm run dev
```

Useful checks:

```bash
curl -u opencode:<your-password> http://localhost:6543/global/health
docker compose --env-file .env.opencode -f docker-compose.opencode.yml logs -f opencode
```

Notes:

- The compose file uses the official image `ghcr.io/anomalyco/opencode:latest` and runs `opencode serve --hostname 0.0.0.0 --port 6543`.
- Host `~/.config/opencode` and `~/.local/share/opencode` are mounted into the container so auth, config, and session history persist.
- `OPENCODE_WORKSPACE_DIR` defaults to `..`, so the repo root is mounted at `/workspace`.
- If you expose the port beyond localhost, set `OPENCODE_SERVER_PASSWORD` in `.env.opencode` so the server is not left unsecured.

## License

Apache-2.0
