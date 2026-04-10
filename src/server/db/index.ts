import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { canvasNode, project, sessionFork, sessionRelation, taskInvocation } from './schema.js'
import type { ProjectRow, RelationType, TaskInvocation } from './schema.js'
import { and, eq, isNull, or } from 'drizzle-orm'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', '..', '..', 'agentree.db')

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
const hasSessionRelationTable = sqlite.prepare(`
  SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_relation'
`).get()
if (hasSessionRelationTable) {
  sqlite.exec(`UPDATE session_relation SET relation_type = 'linked' WHERE relation_type = 'merged-view'`)
}

export const db = drizzle(sqlite, { schema: { project, canvasNode, sessionFork, sessionRelation, taskInvocation } })

export function findOrCreateProject(directoryKey: string): ProjectRow {
  const existing = db.select().from(project).where(eq(project.directory_key, directoryKey)).get()
  if (existing) return existing
  const id = randomUUID()
  db.insert(project).values({ id, name: directoryKey, directory_key: directoryKey }).run()
  return db.select().from(project).where(eq(project.id, id)).get()!
}

export function getAllProjects(): ProjectRow[] {
  return db.select().from(project).all()
}

export function renameProject(id: string, name: string): void {
  db.update(project).set({ name }).where(eq(project.id, id)).run()
}

export function createProject(name: string, directoryKey: string | null): ProjectRow {
  const id = randomUUID()
  db.insert(project).values({ id, name, directory_key: directoryKey, user_created: 1 }).run()
  return db.select().from(project).where(eq(project.id, id)).get()!
}

export function deleteProject(id: string): void {
  db.update(canvasNode).set({ project_id: null }).where(eq(canvasNode.project_id, id)).run()
  db.delete(project).where(eq(project.id, id)).run()
}

export function setCanvasNodeProject(sessionId: string, projectId: string): void {
  const existing = db.select().from(canvasNode).where(eq(canvasNode.session_id, sessionId)).get()
  if (existing) {
    if (existing.project_id !== projectId) {
      db.update(canvasNode).set({ project_id: projectId }).where(eq(canvasNode.session_id, sessionId)).run()
    }
  } else {
    db.insert(canvasNode).values({ session_id: sessionId, canvas_x: 0, canvas_y: 0, pinned: 0, detached: 0, project_id: projectId, updated_at: new Date().toISOString() }).run()
  }
}

export type CanvasNodeInput = {
  x?: number
  y?: number
  label?: string
  pinned?: boolean
  detached?: boolean
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
        ...(input.detached !== undefined && { detached: input.detached ? 1 : 0 }),
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
        detached: input.detached ? 1 : 0,
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

export type TaskInvocationInput = {
  parentSessionId: string
  messageId?: string | null
  partId?: string | null
  childSessionId?: string | null
  agent: string
  description: string
  promptPreview: string
  createdAt?: string
}

export function upsertTaskInvocation(input: TaskInvocationInput): TaskInvocation {
  const now = new Date().toISOString()
  const existing = input.partId
    ? db.select().from(taskInvocation).where(eq(taskInvocation.part_id, input.partId)).get()
    : undefined

  if (existing) {
    db.update(taskInvocation)
      .set({
        parent_session_id: input.parentSessionId,
        ...(input.messageId !== undefined && { message_id: input.messageId }),
        ...(input.childSessionId !== undefined && { child_session_id: input.childSessionId }),
        agent: input.agent,
        description: input.description,
        prompt_preview: input.promptPreview,
        updated_at: now,
      })
      .where(eq(taskInvocation.id, existing.id))
      .run()
    return db.select().from(taskInvocation).where(eq(taskInvocation.id, existing.id)).get()!
  }

  const createdAt = input.createdAt ?? now
  const result = db.insert(taskInvocation)
    .values({
      parent_session_id: input.parentSessionId,
      message_id: input.messageId ?? null,
      part_id: input.partId ?? null,
      child_session_id: input.childSessionId ?? null,
      agent: input.agent,
      description: input.description,
      prompt_preview: input.promptPreview,
      created_at: createdAt,
      updated_at: now,
    })
    .run()
  return db.select().from(taskInvocation).where(eq(taskInvocation.id, Number(result.lastInsertRowid))).get()!
}

export function getAllTaskInvocations(): TaskInvocation[] {
  return db.select().from(taskInvocation).all()
}

export function getTaskInvocationsForSession(sessionId: string): TaskInvocation[] {
  return db.select().from(taskInvocation).where(
    or(
      eq(taskInvocation.parent_session_id, sessionId),
      eq(taskInvocation.child_session_id, sessionId),
    ),
  ).all()
}

export function linkTaskInvocationToChild(parentSessionId: string, childSessionId: string): TaskInvocation | null {
  const existingChild = db.select().from(taskInvocation).where(eq(taskInvocation.child_session_id, childSessionId)).get()
  if (existingChild) return existingChild

  const candidates = db.select().from(taskInvocation).where(
    and(
      eq(taskInvocation.parent_session_id, parentSessionId),
      isNull(taskInvocation.child_session_id),
    ),
  ).all()

  const candidate = candidates.sort((left, right) => right.created_at.localeCompare(left.created_at))[0]
  if (!candidate) return null

  db.update(taskInvocation)
    .set({ child_session_id: childSessionId, updated_at: new Date().toISOString() })
    .where(eq(taskInvocation.id, candidate.id))
    .run()

  return db.select().from(taskInvocation).where(eq(taskInvocation.id, candidate.id)).get()!
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
  db.delete(taskInvocation).where(
    or(
      eq(taskInvocation.parent_session_id, sessionId),
      eq(taskInvocation.child_session_id, sessionId),
    ),
  ).run()
}
