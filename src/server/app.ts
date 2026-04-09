import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { treeRouter } from './routes/tree.js'
import { sessionRouter } from './routes/session.js'
import { canvasRouter } from './routes/canvas.js'
import { approvalRouter } from './routes/approval.js'
import { systemRouter } from './routes/system.js'
import { relationRouter } from './routes/relation.js'
import { projectRouter } from './routes/project.js'
import { sseHandler, isOpencodeConnected } from './sse/broadcaster.js'

export function createApp() {
  const app = new Hono()

  app.onError((err, c) => {
    console.error(`[error] ${c.req.method} ${c.req.path}:`, err instanceof Error ? err.message : String(err))
    const status = err instanceof Error && 'status' in err ? (err as { status: number }).status : 500
    return c.json({ error: err.message ?? 'Internal Server Error' }, status as 500)
  })

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:5174', 'http://localhost:3001']

  app.use('*', cors({
    origin: (origin) => allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  }))

  app.get('/api/health', (c) => c.json({ ok: true, opencode: isOpencodeConnected() }))
  app.get('/api/events', sseHandler)
  app.route('/', treeRouter)
  app.route('/', sessionRouter)
  app.route('/', canvasRouter)
  app.route('/', approvalRouter)
  app.route('/', systemRouter)
  app.route('/', relationRouter)
  app.route('/', projectRouter)

  return app
}
