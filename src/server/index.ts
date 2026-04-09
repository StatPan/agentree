import { serve } from '@hono/node-server'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { startOpencodeListener } from './sse/broadcaster.js'
import { db } from './db/index.js'
import { createApp } from './app.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = createApp()

migrate(db, { migrationsFolder: join(__dirname, '..', '..', 'drizzle') })

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('Agentree server listening on http://localhost:3001')
  startOpencodeListener().catch(console.error)
})
