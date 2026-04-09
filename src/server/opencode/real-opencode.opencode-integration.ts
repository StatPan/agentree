import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { AgentInfo, AgentreeEvent, AgentreeMessage } from './types.js'
import type { TaskInvocation } from '../db/schema.js'

type TestApp = {
  request: (input: string, init?: RequestInit) => Response | Promise<Response>
}

const shouldRun = process.env.AGENTREE_OPENCODE_INTEGRATION === '1' && process.env.AGENTREE_OPENCODE_LLM === '1'
const describeOpencode = shouldRun ? describe : describe.skip
const __dirname = dirname(fileURLToPath(import.meta.url))
const timeoutMs = Number(process.env.AGENTREE_TEST_TIMEOUT_MS ?? 180_000)
const prefix = process.env.AGENTREE_TEST_PREFIX ?? `agentree-it-${Date.now()}`

let app: TestApp
let opencodeAdapter: typeof import('./index.js').opencodeAdapter
let trackTaskLineage: typeof import('../sse/broadcaster.js').trackTaskLineage
let tempDbDir: string | null = null
const createdSessionIds: string[] = []

async function readJson<T>(res: Response, context: string): Promise<T> {
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${context} failed with ${res.status}: ${text}`)
  }
  return text ? JSON.parse(text) as T : (undefined as T)
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return readJson<T>(await Promise.resolve(app.request(path, init)), path)
}

function pickSubagent(agents: AgentInfo[]): string {
  const runnable = agents.filter((agent) => !agent.hidden && (agent.mode === 'subagent' || agent.mode === 'all'))
  for (const name of ['general', 'explore', 'build']) {
    if (runnable.some((agent) => agent.name === name)) return name
  }
  const fallback = runnable[0]?.name
  if (!fallback) throw new Error(`No runnable subagent found. Agents: ${agents.map((agent) => `${agent.name}:${agent.mode}`).join(', ')}`)
  return fallback
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function taskInvocationsFor(sessionId: string) {
  return requestJson<TaskInvocation[]>(`/api/session/${sessionId}/tasks`)
}

async function startTaskWatcher(parentSessionId: string) {
  const stream = await opencodeAdapter.globalEventStream()
  const iterator = stream[Symbol.asyncIterator]()
  const lastEvents: string[] = []
  const observedChildIds = new Set<string>()

  const promise = (async () => {
    const deadline = Date.now() + timeoutMs
    try {
      while (Date.now() < deadline) {
        const remaining = Math.max(0, deadline - Date.now())
        const result = await Promise.race([
          iterator.next().then((value) => ({ kind: 'event' as const, value })),
          delay(Math.min(1000, remaining)).then(() => ({ kind: 'tick' as const })),
        ])

        if (result.kind === 'event') {
          if (result.value.done) break
          const event = result.value.value as AgentreeEvent
          lastEvents.push(event.type)
          if (lastEvents.length > 25) lastEvents.shift()
          trackTaskLineage(event)

          const info = event.properties.info as { id?: string; parentID?: string | null } | undefined
          if (event.type === 'session.created' && info?.id && info.parentID === parentSessionId) {
            observedChildIds.add(info.id)
          }
        }

        const linked = (await taskInvocationsFor(parentSessionId)).find((task) => task.child_session_id)
        if (linked?.child_session_id) {
          observedChildIds.add(linked.child_session_id)
          return { task: linked, lastEvents: [...lastEvents], observedChildIds: [...observedChildIds] }
        }
      }

      throw new Error(`Timed out waiting for linked task. Last events: ${lastEvents.join(', ') || '(none)'}`)
    } finally {
      await iterator.return?.(undefined)
    }
  })()

  return { promise }
}

function hasAssistantText(messages: AgentreeMessage[]) {
  return messages.some((message) => (
    message.info.role === 'assistant'
    && !message.info.error
    && message.parts.some((part) => typeof part.text === 'string' && part.text.trim().length > 0)
  ))
}

async function waitForChildAssistantOutput(childSessionId: string) {
  const deadline = Date.now() + timeoutMs
  let lastMessages: AgentreeMessage[] = []
  while (Date.now() < deadline) {
    lastMessages = await requestJson<AgentreeMessage[]>(`/api/session/${childSessionId}/messages?limit=20`)
    if (hasAssistantText(lastMessages)) return lastMessages
    await delay(2000)
  }

  const summary = lastMessages.map((message) => `${message.info.role}:${message.parts.map((part) => part.type).join('|')}`).join(', ')
  throw new Error(`Timed out waiting for child assistant output. Last messages: ${summary || '(none)'}`)
}

describeOpencode('real opencode server integration', () => {
  beforeAll(async () => {
    process.env.OPENCODE_API_URL ??= 'http://localhost:6543'
    tempDbDir = mkdtempSync(join(tmpdir(), 'agentree-opencode-'))
    process.env.DB_PATH = process.env.AGENTREE_TEST_DB_PATH ?? join(tempDbDir, 'agentree.db')

    const dbModule = await import('../db/index.js')
    migrate(dbModule.db, { migrationsFolder: join(__dirname, '..', '..', '..', 'drizzle') })

    app = (await import('../app.js')).createApp()
    opencodeAdapter = (await import('./index.js')).opencodeAdapter
    trackTaskLineage = (await import('../sse/broadcaster.js')).trackTaskLineage
  })

  afterAll(async () => {
    for (const sessionId of [...createdSessionIds].reverse()) {
      try {
        await Promise.resolve(app?.request(`/api/session/${sessionId}`, { method: 'DELETE' }))
      } catch (error) {
        console.warn(`[opencode-it] failed to delete test session ${sessionId}:`, error)
      }
    }

    if (tempDbDir && !process.env.AGENTREE_TEST_DB_PATH) {
      rmSync(tempDbDir, { recursive: true, force: true })
    }
  })

  it('spawns a real LLM subtask and links it through opencode SSE', async () => {
    const agents = await requestJson<AgentInfo[]>('/api/agents')
    expect(agents.length).toBeGreaterThan(0)
    const agent = pickSubagent(agents)

    const parent = await requestJson<{ id: string; title: string }>('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `${prefix}-parent` }),
    })
    createdSessionIds.push(parent.id)

    const watcher = await startTaskWatcher(parent.id)
    const subtaskRes = await requestJson<{ ok: true; task: TaskInvocation }>(`/api/session/${parent.id}/subtask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent,
        description: `${prefix} subtask`,
        prompt: 'Return exactly this text and do not inspect or modify files: agentree integration ok',
      }),
    })

    expect(subtaskRes.ok).toBe(true)
    expect(subtaskRes.task.parent_session_id).toBe(parent.id)
    expect(subtaskRes.task.agent).toBe(agent)
    expect(subtaskRes.task.part_id).toMatch(/^prt_/)

    const { task, observedChildIds } = await watcher.promise
    expect(task.parent_session_id).toBe(parent.id)
    expect(task.agent).toBe(agent)
    expect(task.child_session_id).toBeTruthy()
    if (task.child_session_id && !createdSessionIds.includes(task.child_session_id)) {
      createdSessionIds.push(task.child_session_id)
    }
    expect(observedChildIds).toContain(task.child_session_id)

    const childMessages = await waitForChildAssistantOutput(task.child_session_id!)
    expect(hasAssistantText(childMessages)).toBe(true)

    const tree = await requestJson<{ taskInvocations: TaskInvocation[]; sessions: Array<{ id: string; parentID: string | null }> }>('/api/tree')
    expect(tree.taskInvocations.some((item) => item.parent_session_id === parent.id && item.child_session_id === task.child_session_id)).toBe(true)
    expect(tree.sessions.some((session) => session.id === task.child_session_id && session.parentID === parent.id)).toBe(true)
  })
})
