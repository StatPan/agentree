import { Hono } from 'hono'
import { getAllProjects, createProject, renameProject, deleteProject } from '../db/index.js'

export const projectRouter = new Hono()

projectRouter.get('/api/project', (c) => {
  return c.json(getAllProjects())
})

projectRouter.post('/api/project', async (c) => {
  const body = await c.req.json<{ name: string; directory?: string }>()
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'name is required' }, 400)
  }
  const proj = createProject(body.name.trim(), body.directory?.trim() || null)
  return c.json(proj)
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
