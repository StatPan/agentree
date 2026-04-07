import { Hono } from 'hono'
import { saveSessionRelation, deleteSessionRelation } from '../db/index.js'
import type { RelationType } from '../db/schema.js'

export const relationRouter = new Hono()

const VALID_RELATION_TYPES: readonly string[] = ['linked', 'detached'] as const

relationRouter.post('/api/relation', async (c) => {
  const body = await c.req.json<{
    fromSessionId: string
    toSessionId: string
    relationType: RelationType
  }>()
  if (!body.fromSessionId || !body.toSessionId || !body.relationType) {
    return c.json({ error: 'fromSessionId, toSessionId, and relationType are required' }, 400)
  }
  if (body.fromSessionId === body.toSessionId) {
    return c.json({ error: 'cannot create self-relation' }, 400)
  }
  if (!VALID_RELATION_TYPES.includes(body.relationType)) {
    return c.json({ error: `relationType must be one of: ${VALID_RELATION_TYPES.join(', ')}` }, 400)
  }
  saveSessionRelation(body.fromSessionId, body.toSessionId, body.relationType)
  return c.json({ ok: true })
})

relationRouter.delete('/api/relation/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'invalid id' }, 400)
  deleteSessionRelation(id)
  return c.json({ ok: true })
})
