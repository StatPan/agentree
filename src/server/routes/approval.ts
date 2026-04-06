import { Hono } from 'hono'
import { opencodeAdapter } from '../opencode/index.js'

export const approvalRouter = new Hono()

approvalRouter.post('/api/permission/:requestID/reply', async (c) => {
  const requestID = c.req.param('requestID')
  const body = await c.req.json<{ reply: 'once' | 'always' | 'reject'; message?: string }>()
  await opencodeAdapter.replyPermission(requestID, body.reply, body.message)
  return c.json({ ok: true })
})

approvalRouter.post('/api/question/:requestID/reply', async (c) => {
  const requestID = c.req.param('requestID')
  const body = await c.req.json<{ answers: Array<{ questionID: string; value: string }> }>()
  await opencodeAdapter.replyQuestion(requestID, body.answers.map((answer) => answer.value))
  return c.json({ ok: true })
})

approvalRouter.post('/api/question/:requestID/reject', async (c) => {
  const requestID = c.req.param('requestID')
  await opencodeAdapter.rejectQuestion(requestID)
  return c.json({ ok: true })
})
