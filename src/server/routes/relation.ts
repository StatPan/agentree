import { Hono } from 'hono'
import { saveSessionRelation, deleteSessionRelation } from '../db/index.js'
import type { RelationType } from '../db/schema.js'

export const relationRouter = new Hono()

relationRouter.post('/api/relation', async (c) => {
  const body = await c.req.json<{
    fromSessionId: string
    toSessionId: string
    relationType: RelationType
  }>()
  if (body.relationType === 'fork') return c.json({ error: 'use /session/:id/fork to create fork relations' }, 400)
  saveSessionRelation(body.fromSessionId, body.toSessionId, body.relationType)
  return c.json({ ok: true })
})

relationRouter.delete('/api/relation/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'invalid id' }, 400)
  deleteSessionRelation(id)
  return c.json({ ok: true })
})
