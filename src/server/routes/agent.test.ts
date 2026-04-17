import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../opencode/index.js', () => ({
  opencodeAdapter: {
    listSessions: vi.fn(),
    listStatuses: vi.fn(),
  },
}))

vi.mock('../db/index.js', () => ({
  getAllCanvasNodes: vi.fn(),
  getAllProjects: vi.fn(),
  getForkRelationMap: vi.fn(),
  getAllSessionRelations: vi.fn(),
  getAllTaskInvocations: vi.fn(),
  findOrCreateProject: vi.fn(),
  setCanvasNodeProject: vi.fn(),
}))

vi.mock('../sse/broadcaster.js', () => ({
  getPendingPermissions: vi.fn(),
  getPendingQuestions: vi.fn(),
}))

import { opencodeAdapter } from '../opencode/index.js'
import {
  getAllCanvasNodes,
  getAllProjects,
  getForkRelationMap,
  getAllSessionRelations,
  getAllTaskInvocations,
  findOrCreateProject,
} from '../db/index.js'
import { getPendingPermissions, getPendingQuestions } from '../sse/broadcaster.js'
import { agentRouter } from './agent.js'

const app = new Hono()
app.route('/', agentRouter)

const mockSessions = [
  { id: 'sess-1', title: 'First', parentID: null, directory: '/home/statpan/workspace/apps/agentree', time: { created: 1000, updated: 2000 } },
  { id: 'sess-2', title: 'Second', parentID: 'sess-1', directory: '/home/statpan/workspace/apps/agentree', time: { created: 1100, updated: 2100 } },
]

const mockProject = { id: 'proj-1', name: 'apps/agentree', directory_key: 'apps/agentree', user_created: 0, created_at: '2024-01-01' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(opencodeAdapter.listSessions).mockResolvedValue(mockSessions)
  vi.mocked(opencodeAdapter.listStatuses).mockResolvedValue({ 'sess-1': 'running', 'sess-2': 'idle' })
  vi.mocked(getAllCanvasNodes).mockReturnValue([
    { session_id: 'sess-1', label: null, canvas_x: 0, canvas_y: 0, pinned: 0, detached: 0, project_id: 'proj-1', updated_at: '' },
    { session_id: 'sess-2', label: null, canvas_x: 0, canvas_y: 0, pinned: 0, detached: 0, project_id: 'proj-1', updated_at: '' },
  ])
  vi.mocked(getAllProjects).mockReturnValue([mockProject])
  vi.mocked(getForkRelationMap).mockReturnValue(new Map())
  vi.mocked(getAllSessionRelations).mockReturnValue([])
  vi.mocked(getAllTaskInvocations).mockReturnValue([])
  vi.mocked(findOrCreateProject).mockReturnValue(mockProject)
  vi.mocked(getPendingPermissions).mockReturnValue([])
  vi.mocked(getPendingQuestions).mockReturnValue([])
})

describe('GET /api/agent/tree', () => {
  it('returns all sessions with statuses when no projectId filter', async () => {
    const res = await app.request('/api/agent/tree')
    expect(res.status).toBe(200)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await res.json() as any
    expect(typeof body.ts).toBe('number')
    expect(body.sessions).toHaveLength(2)
    expect(body.sessions[0]).toMatchObject({ id: 'sess-1', status: 'running', ts: 2000, forkedFrom: null })
    expect(body.sessions[1]).toMatchObject({ id: 'sess-2', status: 'idle', ts: 2100, forkedFrom: null })
  })

  it('includes relations, taskInvocations, pendingPermissions, pendingQuestions, projects', async () => {
    const res = await app.request('/api/agent/tree')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await res.json() as any
    expect(body).toHaveProperty('relations')
    expect(body).toHaveProperty('taskInvocations')
    expect(body).toHaveProperty('pendingPermissions')
    expect(body).toHaveProperty('pendingQuestions')
    expect(body).toHaveProperty('projects')
  })

  it('filters sessions by projectId query param', async () => {
    // Make sess-2 belong to a different project
    vi.mocked(getAllCanvasNodes).mockReturnValue([
      { session_id: 'sess-1', label: null, canvas_x: 0, canvas_y: 0, pinned: 0, detached: 0, project_id: 'proj-1', updated_at: '' },
      { session_id: 'sess-2', label: null, canvas_x: 0, canvas_y: 0, pinned: 0, detached: 0, project_id: 'proj-2', updated_at: '' },
    ])
    const res = await app.request('/api/agent/tree?projectId=proj-1')
    expect(res.status).toBe(200)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await res.json() as any
    expect(body.sessions).toHaveLength(1)
    expect(body.sessions[0].id).toBe('sess-1')
  })

  it('exposes forkedFrom via fork relation map and omits fork overlays from relations', async () => {
    vi.mocked(getForkRelationMap).mockReturnValue(new Map([['sess-2', 'sess-1']]))
    vi.mocked(getAllSessionRelations).mockReturnValue([
      { id: 1, from_session_id: 'sess-1', to_session_id: 'sess-2', relation_type: 'linked', created_at: '' },
      { id: 2, from_session_id: 'sess-1', to_session_id: 'sess-2', relation_type: 'fork', created_at: '' },
    ])

    const res = await app.request('/api/agent/tree')
    expect(res.status).toBe(200)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await res.json() as any
    expect(body.sessions.find((session: { id: string }) => session.id === 'sess-2')?.forkedFrom).toBe('sess-1')
    expect(body.relations).toHaveLength(1)
    expect(body.relations[0].relation_type).toBe('linked')
  })

  it('returns 502 when listSessions fails', async () => {
    vi.mocked(opencodeAdapter.listSessions).mockRejectedValue(new Error('opencode down'))
    const res = await app.request('/api/agent/tree')
    expect(res.status).toBe(502)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await res.json() as any
    expect(body.error).toMatch(/opencode down/)
  })

  it('exposes pending permissions and questions from broadcaster', async () => {
    vi.mocked(getPendingPermissions).mockReturnValue([
      { requestId: 'req-1', sessionId: 'sess-1', message: 'Allow file write?', metadata: {} },
    ])
    vi.mocked(getPendingQuestions).mockReturnValue([
      { requestId: 'q-1', sessionId: 'sess-1', message: 'Which branch?', metadata: {} },
    ])
    const res = await app.request('/api/agent/tree')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await res.json() as any
    expect(body.pendingPermissions).toHaveLength(1)
    expect(body.pendingPermissions[0].requestId).toBe('req-1')
    expect(body.pendingQuestions).toHaveLength(1)
    expect(body.pendingQuestions[0].requestId).toBe('q-1')
  })

  it('overrides session status when a pending permission exists', async () => {
    vi.mocked(getPendingPermissions).mockReturnValue([
      { requestId: 'req-1', sessionId: 'sess-1', message: 'Allow file write?', metadata: {} },
    ])

    const res = await app.request('/api/agent/tree')
    expect(res.status).toBe(200)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await res.json() as any
    expect(body.sessions.find((session: { id: string }) => session.id === 'sess-1')?.status).toBe('needs-permission')
  })

  it('filters pending items by projectId (only items for visible sessions)', async () => {
    vi.mocked(getPendingPermissions).mockReturnValue([
      { requestId: 'req-1', sessionId: 'sess-1', message: 'Allow?', metadata: {} },
      { requestId: 'req-2', sessionId: 'other-sess', message: 'Other?', metadata: {} },
    ])
    const res = await app.request('/api/agent/tree?projectId=proj-1')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await res.json() as any
    // sess-1 is in proj-1, other-sess is not in sessions → filtered out
    expect(body.pendingPermissions).toHaveLength(1)
    expect(body.pendingPermissions[0].requestId).toBe('req-1')
  })

  it('falls back to idle status when listStatuses fails', async () => {
    vi.mocked(opencodeAdapter.listStatuses).mockRejectedValue(new Error('status unavailable'))
    const res = await app.request('/api/agent/tree')
    expect(res.status).toBe(200)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await res.json() as any
    expect(body.sessions[0].status).toBe('idle')
  })
})
