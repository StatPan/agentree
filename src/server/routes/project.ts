import { Hono } from 'hono'
import { getAllProjects, renameProject, deleteProject } from '../db/index.js'

export const projectRouter = new Hono()

projectRouter.get('/api/project', (c) => {
  return c.json(getAllProjects())
})

projectRouter.patch('/api/project/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ name?: string }>()
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'name is required' }, 400)
  }
  renameProject(id, body.name.trim())
  return c.json({ ok: true })
})

projectRouter.delete('/api/project/:id', (c) => {
  const id = c.req.param('id')
  deleteProject(id)
  return c.json({ ok: true })
})
