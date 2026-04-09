#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { serve } from '@hono/node-server'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ─── CLI args ─────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: { type: 'string', short: 'p', default: '3001' },
    'opencode-url': { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: false,
})

if (values.help) {
  console.log(`
  agentree [options]

    --port, -p        Port to listen on (default: 3001)
    --opencode-url    opencode server URL (default: auto-detect)
    --help, -h        Show this help message

  Environment variables:
    OPENCODE_API_URL  opencode server URL (overrides auto-detect)
    OPENCODE_SERVER_USERNAME / OPENCODE_SERVER_PASSWORD  Basic auth credentials
    DB_PATH           SQLite database path (default: ~/.agentree/agentree.db)
    PORT              Port (overrides --port)
  `)
  process.exit(0)
}

const port = Number(process.env.PORT ?? values.port ?? '3001')

// ─── opencode detection ───────────────────────────────────────────────────────

async function healthCheck(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/global/health`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

function readOpencodeConfigPort(): number | null {
  try {
    const configPath = join(homedir(), '.config', 'opencode', 'opencode.json')
    if (!existsSync(configPath)) return null
    const raw = readFileSync(configPath, 'utf-8')
    const cfg = JSON.parse(raw) as Record<string, unknown>
    const server = cfg['server'] as Record<string, unknown> | undefined
    const p = server?.['port']
    return typeof p === 'number' ? p : null
  } catch {
    return null
  }
}

async function resolveOpencodeUrl(cliFlag?: string): Promise<string> {
  // 1. Explicit CLI flag
  if (cliFlag) return cliFlag

  // 2. Environment variable
  if (process.env.OPENCODE_API_URL) return process.env.OPENCODE_API_URL

  // 3. Health check common ports
  const candidates = ['http://localhost:6543', 'http://localhost:4096']
  for (const url of candidates) {
    if (await healthCheck(url)) return url
  }

  // 4. opencode config file
  const configPort = readOpencodeConfigPort()
  if (configPort) {
    const url = `http://localhost:${configPort}`
    if (await healthCheck(url)) return url
  }

  // Not found
  console.error(`
  Could not find a running opencode instance.
  Agentree requires opencode to be running.

  Start opencode, then re-run:
    npx agentree

  Or point to a running instance:
    npx agentree --opencode-url http://localhost:6543

  See https://opencode.ai for installation instructions.
`)
  process.exit(1)
}

// ─── DB path ──────────────────────────────────────────────────────────────────

function resolveDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH
  const dir = join(homedir(), '.agentree')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'agentree.db')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opencodeUrl = await resolveOpencodeUrl(values['opencode-url'])
  const dbPath = resolveDbPath()

  // Set env vars before importing any module that reads them at load time
  process.env.OPENCODE_API_URL = opencodeUrl
  process.env.DB_PATH = dbPath
  process.env.CORS_ORIGIN = `http://localhost:${port}`

  // Dynamic imports — must happen AFTER env vars are set
  const { db } = await import('./db/index.js')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  const { createApp } = await import('./app.js')
  const { startOpencodeListener } = await import('./sse/broadcaster.js')

  const migrationsFolder = join(__dirname, 'drizzle')
  migrate(db, { migrationsFolder })

  const staticDir = join(__dirname, '..', 'client')
  const app = createApp({ staticDir })

  serve({ fetch: app.fetch, port }, () => {
    console.log(`
  Agentree is running

  Local:     http://localhost:${port}
  opencode:  ${opencodeUrl}

  Open http://localhost:${port} in your browser.
`)
    startOpencodeListener().catch(console.error)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
