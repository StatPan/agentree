import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { treeRouter } from './routes/tree.js'
import { sessionRouter } from './routes/session.js'
import { canvasRouter } from './routes/canvas.js'
import { approvalRouter } from './routes/approval.js'
import { systemRouter } from './routes/system.js'
import { relationRouter } from './routes/relation.js'
import { sseHandler, startOpencodeListener } from './sse/broadcaster.js'
import { db } from './db/index.js'

const app = new Hono()
const __dirname = dirname(fileURLToPath(import.meta.url))

app.use('*', cors())
app.get('/api/health', (c) => c.json({ ok: true }))
app.get('/api/events', sseHandler)
app.route('/', treeRouter)
app.route('/', sessionRouter)
app.route('/', canvasRouter)
app.route('/', approvalRouter)
app.route('/', systemRouter)
app.route('/', relationRouter)

migrate(db, { migrationsFolder: join(__dirname, '..', '..', 'drizzle') })

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('Agentree server listening on http://localhost:3001')
  startOpencodeListener().catch(console.error)
})
