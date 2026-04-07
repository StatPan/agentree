import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { canvasNode, sessionFork, sessionRelation } from './schema.js'
import type { RelationType } from './schema.js'
import { eq, or } from 'drizzle-orm'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', '..', '..', 'agentree.db')

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
sqlite.exec(`UPDATE session_relation SET relation_type = 'linked' WHERE relation_type = 'merged-view'`)

export const db = drizzle(sqlite, { schema: { canvasNode, sessionFork, sessionRelation } })

export type CanvasNodeInput = {
  x?: number
  y?: number
  label?: string
  pinned?: boolean
}

export async function saveCanvasNode(sessionId: string, input: CanvasNodeInput): Promise<void> {
  const existing = db.select().from(canvasNode).where(eq(canvasNode.session_id, sessionId)).get()
  if (existing) {
    db.update(canvasNode)
      .set({
        ...(input.x !== undefined && { canvas_x: input.x }),
        ...(input.y !== undefined && { canvas_y: input.y }),
        ...(input.label !== undefined && { label: input.label }),
        ...(input.pinned !== undefined && { pinned: input.pinned ? 1 : 0 }),
        updated_at: new Date().toISOString(),
      })
      .where(eq(canvasNode.session_id, sessionId))
      .run()
  } else {
    db.insert(canvasNode)
      .values({
        session_id: sessionId,
        canvas_x: input.x ?? 0,
        canvas_y: input.y ?? 0,
        label: input.label ?? null,
        pinned: input.pinned ? 1 : 0,
        updated_at: new Date().toISOString(),
      })
      .run()
  }
}

export function getCanvasNode(sessionId: string) {
  return db.select().from(canvasNode).where(eq(canvasNode.session_id, sessionId)).get()
}

export function getAllCanvasNodes() {
  return db.select().from(canvasNode).all()
}

export function saveSessionFork(sessionId: string, forkedFromSessionId: string) {
  const existing = db.select().from(sessionFork).where(eq(sessionFork.session_id, sessionId)).get()
  if (existing) {
    db.update(sessionFork)
      .set({
        forked_from_session_id: forkedFromSessionId,
        created_at: new Date().toISOString(),
      })
      .where(eq(sessionFork.session_id, sessionId))
      .run()
    return
  }

  db.insert(sessionFork)
    .values({
      session_id: sessionId,
      forked_from_session_id: forkedFromSessionId,
      created_at: new Date().toISOString(),
    })
    .run()
}

export function getAllSessionForks() {
  return db.select().from(sessionFork).all()
}

export function saveSessionRelation(
  fromSessionId: string,
  toSessionId: string,
  relationType: RelationType,
): void {
  db.insert(sessionRelation)
    .values({ from_session_id: fromSessionId, to_session_id: toSessionId, relation_type: relationType })
    .run()
}

export function getAllSessionRelations() {
  return db.select().from(sessionRelation).all()
}

export function deleteSessionRelation(id: number): void {
  db.delete(sessionRelation).where(eq(sessionRelation.id, id)).run()
}

export function cleanupSessionData(sessionId: string): void {
  db.delete(canvasNode).where(eq(canvasNode.session_id, sessionId)).run()
  db.delete(sessionFork).where(eq(sessionFork.session_id, sessionId)).run()
  db.delete(sessionRelation).where(
    or(
      eq(sessionRelation.from_session_id, sessionId),
      eq(sessionRelation.to_session_id, sessionId),
    ),
  ).run()
}
