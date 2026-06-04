import { Hono } from 'hono'
import { importGiraWorkspaceStatus } from '../work-map/giraWorkspaceImport.js'

export const workMapRouter = new Hono()

workMapRouter.post('/api/work-map/import/gira', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'request body must be valid JSON' }, 400)
  }

  const workMap = importGiraWorkspaceStatus(body)
  return c.json(workMap)
})
