# Contributing to Agentree

## Workflow

All changes start from an issue.

1. Open or find an issue describing the work
2. Create a branch from `main`:
   ```
   feat/issue-N-short-description
   fix/issue-N-short-description
   chore/issue-N-short-description
   docs/issue-N-short-description
   ```
3. Make changes and commit
4. Open a PR with `Closes #N` in the description
5. CI must pass before merge

## Commit style

```
<type>: <summary>
```

Types: `feat` / `fix` / `chore` / `docs` / `test` / `refactor`

## Local setup

```bash
pnpm install

# Configure opencode
cp .env.opencode.example .env.opencode
# Edit .env.opencode — set OPENCODE_SERVER_PASSWORD

# Start opencode
docker compose --env-file .env.opencode -f docker-compose.opencode.yml up -d

# Run DB migrations
pnpm run db:migrate

# Start dev server
pnpm run dev
```

| Service | URL |
|---------|-----|
| Agentree UI | http://localhost:5174 |
| Agentree API | http://localhost:3001 |
| opencode | http://localhost:6543 |

## Tests

```bash
pnpm test                                          # unit tests (vitest)
pnpm exec tsc --noEmit                             # server type check
pnpm exec tsc --noEmit -p tsconfig.client.json    # client type check
```

All three must pass before opening a PR. The CI workflow runs them automatically on every PR targeting `main`.

## Schema changes

After editing `src/server/db/schema.ts`:

```bash
pnpm run db:generate   # generate new migration
pnpm run db:migrate    # apply migration locally
```

Commit both the schema file and the generated migration files.
