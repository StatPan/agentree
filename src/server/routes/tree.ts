import { Hono } from 'hono'
import { getAllCanvasNodes, getAllSessionForks, getAllSessionRelations } from '../db/index.js'
import { opencodeAdapter } from '../opencode/index.js'

export const treeRouter = new Hono()

treeRouter.get('/api/tree', async (c) => {
  const [sessions, statusBySession, compat] = await Promise.all([
    opencodeAdapter.listSessions(),
    opencodeAdapter.listStatuses(),
    opencodeAdapter.getCompatReport(),
  ])
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
