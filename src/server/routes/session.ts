import { Hono } from 'hono'
import { randomUUID } from 'crypto'
import { saveSessionRelation, cleanupSessionData, getTaskInvocationsForSession, upsertTaskInvocation, setCanvasNodeProject } from '../db/index.js'
import { opencodeAdapter } from '../opencode/index.js'

export const sessionRouter = new Hono()

sessionRouter.post('/api/session', async (c) => {
  const body = await c.req.json<{ title?: string; parentID?: string; directory?: string; projectId?: string }>()
  const session = await opencodeAdapter.createSession(body)
  if (body.projectId) {
    setCanvasNodeProject(session.id, body.projectId)
  }
  return c.json(session)
})

sessionRouter.get('/api/session/:id', async (c) => {
  const sessionID = c.req.param('id')
  return c.json(await opencodeAdapter.getSession(sessionID))
})

sessionRouter.get('/api/session/:id/children', async (c) => {
  const sessionID = c.req.param('id')
  return c.json(await opencodeAdapter.getSessionChildren(sessionID))
})

sessionRouter.get('/api/session/:id/diff', async (c) => {
  const sessionID = c.req.param('id')
  const messageID = c.req.query('messageID')
  return c.json(await opencodeAdapter.getSessionDiff(sessionID, messageID))
})

sessionRouter.get('/api/session/:id/messages', async (c) => {
  const sessionID = c.req.param('id')
  const limit = c.req.query('limit')
  const parsed = limit ? Number.parseInt(limit, 10) : undefined
  const parsedLimit = parsed !== undefined && !Number.isNaN(parsed) ? parsed : undefined
  return c.json(await opencodeAdapter.getSessionMessages(sessionID, parsedLimit))
})

sessionRouter.get('/api/session/:id/tasks', async (c) => {
  const sessionID = c.req.param('id')
  return c.json(getTaskInvocationsForSession(sessionID))
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
  const prompt = body.prompt?.trim()
  if (!prompt) return c.json({ error: 'prompt is required' }, 400)
  const agent = body.agent?.trim() || 'build'
  const description = body.description?.trim() || prompt.slice(0, 80)
  const partID = `prt_${randomUUID()}`
  const task = upsertTaskInvocation({
    parentSessionId: sessionID,
    partId: partID,
    agent,
    description,
    promptPreview: prompt.slice(0, 500),
  })
  await opencodeAdapter.sendSubtask({ sessionID, partID, prompt, description, agent, model: body.model })
  return c.json({ ok: true, task })
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
  saveSessionRelation(sessionID, session.id, 'fork')
  return c.json(session)
})

sessionRouter.post('/api/session/:id/revert', async (c) => {
  const sessionID = c.req.param('id')
  let body: { messageID?: string; partID?: string } = {}
  const contentType = c.req.header('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  }
  const session = await opencodeAdapter.revertSession(sessionID, body.messageID, body.partID)
  return c.json(session)
})

sessionRouter.post('/api/session/:id/unrevert', async (c) => {
  const sessionID = c.req.param('id')
  const session = await opencodeAdapter.unrevertSession(sessionID)
  return c.json(session)
})

sessionRouter.post('/api/session/:id/summarize', async (c) => {
  const sessionID = c.req.param('id')
  let body: { providerID?: string; modelID?: string } = {}
  const contentType = c.req.header('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  }
  const ok = await opencodeAdapter.summarizeSession(sessionID, body.providerID, body.modelID)
  return c.json({ ok })
})

sessionRouter.post('/api/session/:id/share', async (c) => {
  const sessionID = c.req.param('id')
  const session = await opencodeAdapter.shareSession(sessionID)
  return c.json(session)
})

sessionRouter.delete('/api/session/:id/share', async (c) => {
  const sessionID = c.req.param('id')
  const session = await opencodeAdapter.unshareSession(sessionID)
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
  cleanupSessionData(sessionID)
  return c.json({ ok: true })
})
