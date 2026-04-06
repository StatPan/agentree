import { Hono } from 'hono'
import { saveCanvasNode } from '../db/index.js'

export const canvasRouter = new Hono()

canvasRouter.patch('/api/canvas/:id', async (c) => {
  const sessionID = c.req.param('id')
  const body = await c.req.json<{ x?: number; y?: number; label?: string; pinned?: boolean }>()
  await saveCanvasNode(sessionID, body)
  return c.json({ ok: true, sessionID })
})
