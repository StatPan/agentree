import { Hono } from 'hono'
import { getAllCanvasNodes, getAllSessionForks, getAllSessionRelations } from '../db/index.js'
import { opencodeAdapter } from '../opencode/index.js'

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
  const canvasBySession = new Map(
    getAllCanvasNodes().map((node) => [
      node.session_id,
      {
        label: node.label,
        x: node.canvas_x,
        y: node.canvas_y,
        pinned: Boolean(node.pinned),
      },
    ]),
  )
  const forksBySession = new Map(
    getAllSessionForks().map((fork) => [fork.session_id, fork.forked_from_session_id]),
  )
  const relations = getAllSessionRelations()
  return c.json({
    sessions: sessions.map((session) => ({
      ...session,
      title: canvasBySession.get(session.id)?.label ?? session.title,
      canvas: canvasBySession.get(session.id) ?? null,
      forkedFromSessionID: forksBySession.get(session.id) ?? null,
    })),
    statusBySession,
    compat,
    relations,
  })
})
