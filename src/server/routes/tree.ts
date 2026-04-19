import { Hono } from 'hono'
import { getAllCanvasNodes, getAllProjects, getForkRelationMap, getAllSessionRelations, getAllTaskInvocations, findOrCreateProject, setCanvasNodeProject } from '../db/index.js'
import type { ProjectRow } from '../db/schema.js'
import { opencodeAdapter } from '../opencode/index.js'
import { projectGroupFromDirectory } from '../utils/projectGroup.js'

export const treeRouter = new Hono()

treeRouter.get('/api/tree', async (c) => {
  const [sessionsResult, statusResult, compatResult] = await Promise.allSettled([
    opencodeAdapter.listSessions(),
    opencodeAdapter.listStatuses(),
    opencodeAdapter.getCompatReport(),
  ])
  if (sessionsResult.status === 'rejected') {
    const reason = sessionsResult.reason instanceof Error ? sessionsResult.reason.message : String(sessionsResult.reason)
    console.error('[tree] Failed to load sessions:', reason)
    return c.json({ error: `Failed to load sessions: ${reason}` }, 502)
  }
  const sessions = sessionsResult.value
  const statusBySession = statusResult.status === 'fulfilled' ? statusResult.value : {}
  const compat = compatResult.status === 'fulfilled' ? compatResult.value : null

  // Auto-create projects for each unique directory key and assign sessions
  const projectByDirectoryKey = new Map<string, ProjectRow>()
  for (const session of sessions) {
    const dirKey = projectGroupFromDirectory(session.directory)
    if (!projectByDirectoryKey.has(dirKey)) {
      const proj = findOrCreateProject(dirKey)
      projectByDirectoryKey.set(dirKey, proj)
    }
  }

  const canvasBySession = new Map(
    getAllCanvasNodes().map((node) => [
      node.session_id,
      {
        label: node.label,
        x: node.canvas_x,
        y: node.canvas_y,
        pinned: Boolean(node.pinned),
        detached: Boolean(node.detached),
        projectId: node.project_id ?? null,
      },
    ]),
  )

  // Ensure each session has a project_id set in canvas_node
  for (const session of sessions) {
    const dirKey = projectGroupFromDirectory(session.directory)
    const proj = projectByDirectoryKey.get(dirKey)
    if (!proj) continue
    const canvas = canvasBySession.get(session.id)
    if (!canvas?.projectId) {
      setCanvasNodeProject(session.id, proj.id)
      if (canvas) {
        canvas.projectId = proj.id
      } else {
        canvasBySession.set(session.id, { label: null, x: 0, y: 0, pinned: false, detached: false, projectId: proj.id })
      }
    }
  }

  const forksBySession = getForkRelationMap()
  const relations = getAllSessionRelations()
  const taskInvocations = getAllTaskInvocations()
  const projects = getAllProjects()

  return c.json({
    sessions: sessions.map((session) => ({
      ...session,
      title: canvasBySession.get(session.id)?.label ?? session.title,
      canvas: canvasBySession.get(session.id) ?? null,
      forkedFromSessionID: forksBySession.get(session.id) ?? null,
      projectId: canvasBySession.get(session.id)?.projectId ?? null,
    })),
    statusBySession,
    compat,
    relations,
    taskInvocations,
    projects,
  })
})
