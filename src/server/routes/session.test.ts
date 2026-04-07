import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../opencode/index.js', () => ({
  opencodeAdapter: {
    createSession: vi.fn(),
    getSession: vi.fn(),
    getSessionChildren: vi.fn(),
    getSessionDiff: vi.fn(),
    getSessionMessages: vi.fn(),
    sendPrompt: vi.fn(),
    sendSubtask: vi.fn(),
    forkSession: vi.fn(),
    revertSession: vi.fn(),
    unrevertSession: vi.fn(),
    summarizeSession: vi.fn(),
    shareSession: vi.fn(),
    unshareSession: vi.fn(),
    abortSession: vi.fn(),
    deleteSession: vi.fn(),
  },
}))

vi.mock('../db/index.js', () => ({
  saveSessionFork: vi.fn(),
  saveSessionRelation: vi.fn(),
  cleanupSessionData: vi.fn(),
}))

import { opencodeAdapter } from '../opencode/index.js'
import { saveSessionFork, saveSessionRelation, cleanupSessionData } from '../db/index.js'
import { sessionRouter } from './session.js'

const app = new Hono()
app.route('/', sessionRouter)

const mockSession = { id: 'sess-1', title: 'Test', parentID: null, directory: '/tmp', time: { created: 1, updated: 2 } }

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── GET routes ──────────────────────────────────────────────────────────────

describe('GET /api/session/:id', () => {
  it('returns session data', async () => {
    vi.mocked(opencodeAdapter.getSession).mockResolvedValue(mockSession)
    const res = await app.request('/api/session/sess-1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(mockSession)
    expect(opencodeAdapter.getSession).toHaveBeenCalledWith('sess-1')
  })
})

describe('GET /api/session/:id/children', () => {
  it('returns children array', async () => {
    vi.mocked(opencodeAdapter.getSessionChildren).mockResolvedValue([mockSession])
    const res = await app.request('/api/session/sess-1/children')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([mockSession])
  })
})

describe('GET /api/session/:id/diff', () => {
  it('returns diff data', async () => {
    const diffs = [{ file: 'a.ts', before: '', after: 'x', additions: 1, deletions: 0 }]
    vi.mocked(opencodeAdapter.getSessionDiff).mockResolvedValue(diffs)
    const res = await app.request('/api/session/sess-1/diff')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(diffs)
    expect(opencodeAdapter.getSessionDiff).toHaveBeenCalledWith('sess-1', undefined)
  })

  it('passes messageID query param', async () => {
    vi.mocked(opencodeAdapter.getSessionDiff).mockResolvedValue([])
    await app.request('/api/session/sess-1/diff?messageID=msg-1')
    expect(opencodeAdapter.getSessionDiff).toHaveBeenCalledWith('sess-1', 'msg-1')
  })
})

describe('GET /api/session/:id/messages', () => {
  it('returns messages without limit', async () => {
    vi.mocked(opencodeAdapter.getSessionMessages).mockResolvedValue([])
    const res = await app.request('/api/session/sess-1/messages')
    expect(res.status).toBe(200)
    expect(opencodeAdapter.getSessionMessages).toHaveBeenCalledWith('sess-1', undefined)
  })

  it('parses numeric limit', async () => {
    vi.mocked(opencodeAdapter.getSessionMessages).mockResolvedValue([])
    await app.request('/api/session/sess-1/messages?limit=10')
    expect(opencodeAdapter.getSessionMessages).toHaveBeenCalledWith('sess-1', 10)
  })

  it('ignores NaN limit', async () => {
    vi.mocked(opencodeAdapter.getSessionMessages).mockResolvedValue([])
    await app.request('/api/session/sess-1/messages?limit=abc')
    expect(opencodeAdapter.getSessionMessages).toHaveBeenCalledWith('sess-1', undefined)
  })
})

// ─── POST routes ─────────────────────────────────────────────────────────────

describe('POST /api/session/:id/fork', () => {
  it('forks session and saves to DB', async () => {
    const forked = { ...mockSession, id: 'sess-2' }
    vi.mocked(opencodeAdapter.forkSession).mockResolvedValue(forked)
    const res = await app.request('/api/session/sess-1/fork', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(forked)
    expect(saveSessionFork).toHaveBeenCalledWith('sess-2', 'sess-1')
    expect(saveSessionRelation).toHaveBeenCalledWith('sess-1', 'sess-2', 'fork')
  })

  it('works without JSON body', async () => {
    const forked = { ...mockSession, id: 'sess-2' }
    vi.mocked(opencodeAdapter.forkSession).mockResolvedValue(forked)
    const res = await app.request('/api/session/sess-1/fork', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(opencodeAdapter.forkSession).toHaveBeenCalledWith({ sessionID: 'sess-1', messageID: undefined })
  })

  it('returns 400 on invalid JSON', async () => {
    const res = await app.request('/api/session/sess-1/fork', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid',
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/session/:id/revert', () => {
  it('reverts session', async () => {
    vi.mocked(opencodeAdapter.revertSession).mockResolvedValue(mockSession)
    const res = await app.request('/api/session/sess-1/revert', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(opencodeAdapter.revertSession).toHaveBeenCalledWith('sess-1', undefined, undefined)
  })

  it('passes messageID from body', async () => {
    vi.mocked(opencodeAdapter.revertSession).mockResolvedValue(mockSession)
    await app.request('/api/session/sess-1/revert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageID: 'msg-1' }),
    })
    expect(opencodeAdapter.revertSession).toHaveBeenCalledWith('sess-1', 'msg-1', undefined)
  })
})

describe('POST /api/session/:id/unrevert', () => {
  it('unreverts session', async () => {
    vi.mocked(opencodeAdapter.unrevertSession).mockResolvedValue(mockSession)
    const res = await app.request('/api/session/sess-1/unrevert', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(mockSession)
  })
})

describe('POST /api/session/:id/summarize', () => {
  it('summarizes session', async () => {
    vi.mocked(opencodeAdapter.summarizeSession).mockResolvedValue(true)
    const res = await app.request('/api/session/sess-1/summarize', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('works without body', async () => {
    vi.mocked(opencodeAdapter.summarizeSession).mockResolvedValue(true)
    await app.request('/api/session/sess-1/summarize', { method: 'POST' })
    expect(opencodeAdapter.summarizeSession).toHaveBeenCalledWith('sess-1', undefined, undefined)
  })
})

describe('POST /api/session/:id/share', () => {
  it('shares session', async () => {
    const shared = { ...mockSession, share: { url: 'https://example.com' } }
    vi.mocked(opencodeAdapter.shareSession).mockResolvedValue(shared)
    const res = await app.request('/api/session/sess-1/share', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(shared)
  })
})

describe('DELETE /api/session/:id/share', () => {
  it('unshares session', async () => {
    vi.mocked(opencodeAdapter.unshareSession).mockResolvedValue(mockSession)
    const res = await app.request('/api/session/sess-1/share', { method: 'DELETE' })
    expect(res.status).toBe(200)
  })
})

describe('POST /api/session/:id/abort', () => {
  it('aborts session', async () => {
    vi.mocked(opencodeAdapter.abortSession).mockResolvedValue(undefined)
    const res = await app.request('/api/session/sess-1/abort', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})

describe('DELETE /api/session/:id', () => {
  it('deletes session and cleans up DB', async () => {
    vi.mocked(opencodeAdapter.deleteSession).mockResolvedValue(undefined)
    const res = await app.request('/api/session/sess-1', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(opencodeAdapter.deleteSession).toHaveBeenCalledWith('sess-1')
    expect(cleanupSessionData).toHaveBeenCalledWith('sess-1')
  })
})
