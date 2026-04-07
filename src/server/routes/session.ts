import { Hono } from 'hono'
import { saveSessionFork, saveSessionRelation } from '../db/index.js'
import { opencodeAdapter } from '../opencode/index.js'

export const sessionRouter = new Hono()

sessionRouter.post('/api/session', async (c) => {
  const body = await c.req.json<{ title?: string; parentID?: string; directory?: string }>()
  const session = await opencodeAdapter.createSession(body)
  return c.json(session)
})

sessionRouter.get('/api/session/:id', async (c) => {
  const sessionID = c.req.param('id')
  return c.json(await opencodeAdapter.getSession(sessionID))
})

sessionRouter.get('/api/session/:id/messages', async (c) => {
  const sessionID = c.req.param('id')
  const limit = c.req.query('limit')
  const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined
  return c.json(await opencodeAdapter.getSessionMessages(sessionID, parsedLimit))
})

sessionRouter.post('/api/session/:id/prompt', async (c) => {
  const sessionID = c.req.param('id')
  const body = await c.req.json<{ text: string }>()
  await opencodeAdapter.sendPrompt(sessionID, body.text)
  return c.json({ ok: true })
})

sessionRouter.post('/api/session/:id/subtask', async (c) => {
  const sessionID = c.req.param('id')
  const body = await c.req.json<{
    prompt: string
    description?: string
    agent?: string
    model?: { providerID: string; modelID: string }
  }>()
  await opencodeAdapter.sendSubtask({ sessionID, ...body })
  return c.json({ ok: true })
})

sessionRouter.post('/api/session/:id/fork', async (c) => {
  const sessionID = c.req.param('id')
  // C4: Parse body safely — fork can legitimately have no body (optional messageID)
  let body: { messageID?: string } = {}
  const contentType = c.req.header('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try { body = await c.req.json<{ messageID?: string }>() } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
  }
  const session = await opencodeAdapter.forkSession({ sessionID, messageID: body.messageID })
  saveSessionFork(session.id, sessionID)
  saveSessionRelation(sessionID, session.id, 'fork')
  return c.json(session)
})

sessionRouter.post('/api/session/:id/abort', async (c) => {
  const sessionID = c.req.param('id')
  await opencodeAdapter.abortSession(sessionID)
  return c.json({ ok: true })
})

sessionRouter.delete('/api/session/:id', async (c) => {
  const sessionID = c.req.param('id')
  await opencodeAdapter.deleteSession(sessionID)
  return c.json({ ok: true })
})
