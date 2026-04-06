import { Hono } from 'hono'
import { opencodeAdapter } from '../opencode/index.js'

export const systemRouter = new Hono()

systemRouter.get('/api/system/compat', async (c) => {
  return c.json(await opencodeAdapter.getCompatReport())
})
