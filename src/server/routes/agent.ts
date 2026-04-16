import { Hono } from 'hono'
import { getAllCanvasNodes, getAllProjects, getAllSessionRelations, getAllTaskInvocations, getForkRelationMap, findOrCreateProject, setCanvasNodeProject } from '../db/index.js'
import { opencodeAdapter } from '../opencode/index.js'
import { getPendingPermissions, getPendingQuestions } from '../sse/broadcaster.js'

export const agentRouter = new Hono()

function projectGroupFromDirectory(directory: string): string {
  const marker = '/workspace/'
  const index = directory.indexOf(marker)
  const normalized = index >= 0 ? directory.slice(index + marker.length) : directory.replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return 'workspace'
  const bucketPrefixes = new Set(['apps', 'research', 'pypi_lib', 'libs', 'infra', 'skills', 'mcps', 'anal-repo'])
  if (parts.length >= 2 && bucketPrefixes.has(parts[0])) {
    return `${parts[0]}/${parts[1]}`
  }
  return parts[0]
}

/**
 * GET /api/agent/tree
 * Compact supervisor-agent view of the session tree.
 * Query params:
 *   projectId (optional) — filter to sessions belonging to a project UUID
 */
agentRouter.get('/api/agent/tree', async (c) => {
  const projectId = c.req.query('projectId') ?? null
  const snapshotTs = Date.now()

  const [sessionsResult, statusResult] = await Promise.allSettled([
    opencodeAdapter.listSessions(),
    opencodeAdapter.listStatuses(),
  ])

  if (sessionsResult.status === 'rejected') {
    const reason = sessionsResult.reason instanceof Error ? sessionsResult.reason.message : String(sessionsResult.reason)
    return c.json({ error: `Failed to load sessions: ${reason}` }, 502)
  }

  const sessions = sessionsResult.value
  const statusBySession = statusResult.status === 'fulfilled' ? statusResult.value : {}

  // Auto-create/resolve projects (same logic as tree.ts)
  const projectByDirectoryKey = new Map<string, { id: string; name: string }>()
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
        pinned: Boolean(node.pinned),
        detached: Boolean(node.detached),
        projectId: node.project_id ?? null,
      },
    ]),
  )

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
        canvasBySession.set(session.id, { label: null, pinned: false, detached: false, projectId: proj.id })
      }
    }
  }

  const relations = getAllSessionRelations()
  const taskInvocations = getAllTaskInvocations()
  const projects = getAllProjects()
  const forksBySession = getForkRelationMap()
  const pendingPermissions = getPendingPermissions()
  const pendingQuestions = getPendingQuestions()
  const pendingPermissionSessionIds = new Set(pendingPermissions.map((item) => item.sessionId))
  const pendingQuestionSessionIds = new Set(pendingQuestions.map((item) => item.sessionId))

  // Build compact session list, optionally filtered by projectId
  const enriched = sessions
    .map((session) => {
      const canvas = canvasBySession.get(session.id) ?? null
      return {
        id: session.id,
        title: canvas?.label ?? session.title,
        parentID: session.parentID ?? null,
        directory: session.directory,
        projectId: canvas?.projectId ?? null,
        status: pendingPermissionSessionIds.has(session.id)
          ? 'needs-permission'
          : pendingQuestionSessionIds.has(session.id)
            ? 'needs-answer'
            : (statusBySession[session.id] ?? 'idle'),
        createdAt: session.time.created,
        updatedAt: session.time.updated,
        ts: session.time.updated,
        forkedFrom: forksBySession.get(session.id) ?? null,
      }
    })
    .filter((s) => !projectId || s.projectId === projectId)

  const visibleIds = new Set(enriched.map((s) => s.id))

  return c.json({
    ts: snapshotTs,
    sessions: enriched,
    relations: relations.filter(
      (r) => r.relation_type !== 'fork'
        && visibleIds.has(r.from_session_id)
        && visibleIds.has(r.to_session_id),
    ),
    taskInvocations: taskInvocations.filter(
      (t) => visibleIds.has(t.parent_session_id) || (t.child_session_id ? visibleIds.has(t.child_session_id) : false),
    ),
    pendingPermissions: pendingPermissions.filter((p) => !projectId || visibleIds.has(p.sessionId)),
    pendingQuestions: pendingQuestions.filter((q) => !projectId || visibleIds.has(q.sessionId)),
    projects: projects.filter((p) => !projectId || p.id === projectId),
  })
})
