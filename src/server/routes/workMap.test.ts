import { readFile } from 'node:fs/promises'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { workMapRouter } from './workMap.js'

const app = new Hono()
app.route('/', workMapRouter)

async function readFixtureText() {
  return readFile(new URL('../work-map/testdata/gira-workspace-status.sample.json', import.meta.url), 'utf8')
}

describe('POST /api/work-map/import/gira', () => {
  it('imports Gira workspace status JSON without mutating canonical state', async () => {
    const res = await app.request('/api/work-map/import/gira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await readFixtureText(),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { source: { readOnly: boolean }; nodes: unknown[]; edges: unknown[] }
    expect(body.source.readOnly).toBe(true)
    expect(body.nodes).toHaveLength(3)
    expect(body.edges).toHaveLength(1)
  })

  it('rejects invalid JSON', async () => {
    const res = await app.request('/api/work-map/import/gira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid',
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'request body must be valid JSON' })
  })
})
