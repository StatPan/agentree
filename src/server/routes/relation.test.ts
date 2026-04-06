import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

// Mock the DB module so routes don't need a real SQLite file
vi.mock('../db/index.js', () => ({
  saveSessionRelation: vi.fn(),
  deleteSessionRelation: vi.fn(),
}))

import { saveSessionRelation, deleteSessionRelation } from '../db/index.js'
import { relationRouter } from './relation.js'

const app = new Hono()
app.route('/', relationRouter)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/relation', () => {
  it('creates a linked relation', async () => {
    const res = await app.request('/api/relation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromSessionId: 'a', toSessionId: 'b', relationType: 'linked' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(saveSessionRelation).toHaveBeenCalledWith('a', 'b', 'linked')
  })

  it('rejects fork relation type', async () => {
    const res = await app.request('/api/relation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromSessionId: 'a', toSessionId: 'b', relationType: 'fork' }),
    })
    expect(res.status).toBe(400)
    expect(saveSessionRelation).not.toHaveBeenCalled()
  })

  it('accepts merged-view and detached types', async () => {
    for (const type of ['merged-view', 'detached'] as const) {
      vi.clearAllMocks()
      const res = await app.request('/api/relation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromSessionId: 'a', toSessionId: 'b', relationType: type }),
      })
      expect(res.status).toBe(200)
      expect(saveSessionRelation).toHaveBeenCalledWith('a', 'b', type)
    }
  })
})

describe('DELETE /api/relation/:id', () => {
  it('deletes by numeric id', async () => {
    const res = await app.request('/api/relation/42', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(deleteSessionRelation).toHaveBeenCalledWith(42)
  })

  it('rejects non-numeric id', async () => {
    const res = await app.request('/api/relation/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
    expect(deleteSessionRelation).not.toHaveBeenCalled()
  })
})
