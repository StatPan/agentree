# OpenCode Integration Map

Living source map for how `agentree` uses `opencode`, what data is already available, and which gaps remain for session supervision UX.

Last verified against:
- `@opencode-ai/sdk` `1.3.13`
- local app code in `src/server` and `src/client`

## Why this file exists

`agentree` is no longer at the “just draw a tree” stage. The next work depends on understanding:

- which `opencode` APIs already expose useful session metadata
- which SSE events can drive supervision UI
- which parts of the current UI only show a small subset of that data

This file is the handoff anchor so future work does not require re-discovering the same integration details.

## Current integration shape

### Server entrypoints

- `src/server/opencode/client.ts`
  - creates the SDK client with `createOpencodeClient(...)`
  - supports Basic Auth via `OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD`
- `src/server/sse/broadcaster.ts`
  - subscribes to `opencode.global.event()`
  - re-broadcasts the global SSE stream to the browser via `/api/events`
- `src/server/routes/session.ts`
  - `GET /api/session/:id` -> `opencode.session.get({ sessionID })`
  - `GET /api/session/:id/messages` -> `opencode.session.messages({ sessionID, limit })`
  - `POST /api/session/:id/prompt` -> `opencode.session.prompt({ sessionID, parts: [{ type: 'text', text }] })`
  - `POST /api/session/:id/abort` -> `opencode.session.abort({ sessionID })`
- `src/server/routes/approval.ts`
  - `POST /api/permission/:requestID/reply` -> `opencode.permission.reply(...)`
  - `POST /api/question/:requestID/reply` -> `opencode.question.reply(...)`
  - `POST /api/question/:requestID/reject` -> `opencode.question.reject(...)`

### Client entrypoints

- `src/client/store/agentStore.ts`
  - receives `/api/tree` snapshot and `/api/events` SSE updates
  - derives canvas nodes, edges, recent/all view mode, group headers
  - tracks `pendingPermissions` and `pendingQuestions`
- `src/client/canvas/AgentCanvas.tsx`
  - loads `/api/tree`
  - subscribes to `/api/events`
  - persists node drag position to `/api/canvas/:id`
- `src/client/panel/SessionPanel.tsx`
  - loads `/api/session/:id`
  - loads `/api/session/:id/messages?limit=50`
  - supports prompt, abort, permission reply, question reply/reject

## OpenCode data that Agentree already uses

### Session snapshot

The SDK `Session` type already includes:

- `id`
- `slug`
- `projectID`
- `workspaceID?`
- `directory`
- `parentID?`
- `title`
- `version`
- `time.created`
- `time.updated`
- `time.compacting?`
- `time.archived?`
- `summary` with file diff counts
- `share?.url`
- `permission` ruleset
- `revert` metadata

Current usage in Agentree:

- heavily used: `id`, `parentID`, `directory`, `title`, `time`
- stored but not surfaced in UI: `projectID`, `workspaceID`, `version`, `summary`, `share`, `permission`, `revert`

## Message and part data available for richer session detail

### Message metadata

`session.messages(...)` returns message records whose `info` shape contains much more than the current panel shows.

For user messages, useful fields include:

- `agent`
- `model.providerID`
- `model.modelID`
- `tools`
- `variant`
- `system`
- `summary`

For assistant messages, useful fields include:

- `providerID`
- `modelID`
- `mode`
- `agent`
- `path.cwd`
- `path.root`
- `cost`
- token breakdown
  - `input`
  - `output`
  - `reasoning`
  - cache read/write
- `finish`
- `variant`
- `error`

Current panel behavior:

- only renders `text` and `reasoning` parts
- ignores most message metadata
- does not render tool/file/subtask/patch/snapshot parts

### Parts relevant to supervision

The SDK exposes these part types that matter for a supervisor console:

- `subtask`
  - contains `prompt`, `description`, `agent`, optional `model`
  - best candidate for “why was this sub-agent created?”
- `tool`
  - contains tool name, call ID, state, input/output, attachments
  - useful for inspection and post-hoc review
- `file`
  - points to produced/read files
- `patch`
  - lists changed files
- `agent`
  - identifies agent metadata attached to a message
- `step-start` / `step-finish`
  - useful for showing execution phases

Current panel behavior:

- these part types are fetched but not surfaced

## SSE events already relevant to supervision

Agentree currently handles only a subset of useful events.

### Already used

- `session.status`
- `session.idle`
- `session.error`
- `permission.asked`
- `permission.updated`
- `permission.replied`
- `question.asked`
- `question.updated`
- `question.replied`
- `question.rejected`
- `session.created`

### Available but not yet used in UI

- `session.updated`
  - useful for title/version/archive/share changes
- `message.updated`
  - useful for live message metadata refresh
- `message.part.updated`
  - useful for live tool/subtask/file rendering
- `message.part.delta`
  - useful for streaming text updates
- `todo.updated`
  - useful for showing per-session task lists
- `session.diff`
  - useful for quick “what changed” summaries
- `command.executed`
  - useful for supervisor visibility into agent-issued commands
- `pty.created` / `pty.updated` / `pty.exited`
  - useful if terminal supervision becomes a first-class feature

## Current supervision readiness

### Already possible

- see the session tree
- select a session and inspect basic message history
- send a follow-up prompt to a session
- abort a session
- approve or deny permission requests
- answer or reject questions

### Not yet implemented, but supported by available data

- session metadata panel
  - model/provider
  - agent name
  - cwd/root path
  - token and cost counters
  - project/workspace/version/share URL
- sub-agent creation detail
  - show `subtask` parts as explicit child-session launch records
- review-oriented timeline
  - tool calls
  - patches
  - file attachments
  - diffs
- pending queue summary
  - list all sessions waiting on permission/question
- richer reject/review flows
  - rejection reason
  - re-prompt from parent or selected child context

### Still unclear or needs validation in runtime

- exact relationship between a `subtask` part and the eventual `session.created` child session in live data
- whether all desired model/provider metadata is always present across providers
- whether question payloads always map cleanly to the current “first question only” UI
- whether permission payloads always include enough human-readable context for good review UX

## Immediate next implementation target

The next supervision-focused panel pass should add:

1. Session metadata block at the top of the side panel
   - session ID
   - parent ID
   - directory
   - project/workspace IDs if present
   - created/updated timestamps
   - version/share URL if present
2. Latest execution metadata summary
   - latest assistant message provider/model/agent/mode
   - cwd/root
   - token/cost summary
3. Structured part rendering below messages
   - `subtask`
   - `tool`
   - `file`
   - `patch`
4. Pending supervision summary
   - explicit block for permission/question state
   - payload inspection, not just approve/reject buttons

## Code locations to update for that work

- `src/client/panel/SessionPanel.tsx`
  - primary UI expansion point
- `src/server/routes/session.ts`
  - add derived endpoints only if the raw `session.get/messages` payload becomes too noisy
- `src/client/store/agentStore.ts`
  - add richer event handling for `session.updated`, `message.updated`, `message.part.updated`, `todo.updated`, `session.diff`

## Notes for future updates

When adding new supervision features, update this file with:

- the exact SDK type or event name used
- the client/server file where it is wired
- whether the feature is live via SSE, snapshot-only, or manual refresh only
- any payload assumptions discovered from real runtime data
