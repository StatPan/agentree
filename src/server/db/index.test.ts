import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, eq, isNull, or } from 'drizzle-orm'
import { sessionRelation, taskInvocation } from './schema.js'

// Build an isolated in-memory DB with just the tables we need
function makeTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE session_relation (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      from_session_id TEXT NOT NULL,
      to_session_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
    );
    CREATE TABLE task_invocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      parent_session_id TEXT NOT NULL,
      message_id TEXT,
      part_id TEXT,
      child_session_id TEXT,
      agent TEXT NOT NULL,
      description TEXT NOT NULL,
      prompt_preview TEXT NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
    )
  `)
  const db = drizzle(sqlite, { schema: { sessionRelation, taskInvocation } })

  function saveRelation(from: string, to: string, type: string) {
    db.insert(sessionRelation).values({ from_session_id: from, to_session_id: to, relation_type: type as never }).run()
  }

  function getAll() {
    return db.select().from(sessionRelation).all()
  }

  function deleteRelation(id: number) {
    db.delete(sessionRelation).where(eq(sessionRelation.id, id)).run()
  }

  function upsertTask(input: {
    parentSessionId: string
    messageId?: string | null
    partId: string
    childSessionId?: string | null
    agent: string
    description: string
    promptPreview: string
    createdAt: string
  }) {
    const existing = db.select().from(taskInvocation).where(eq(taskInvocation.part_id, input.partId)).get()
    if (existing) {
      db.update(taskInvocation)
        .set({
          parent_session_id: input.parentSessionId,
          message_id: input.messageId ?? null,
          child_session_id: input.childSessionId ?? existing.child_session_id,
          agent: input.agent,
          description: input.description,
          prompt_preview: input.promptPreview,
          updated_at: input.createdAt,
        })
        .where(eq(taskInvocation.id, existing.id))
        .run()
      return db.select().from(taskInvocation).where(eq(taskInvocation.id, existing.id)).get()!
    }

    const result = db.insert(taskInvocation)
      .values({
        parent_session_id: input.parentSessionId,
        message_id: input.messageId ?? null,
        part_id: input.partId,
        child_session_id: input.childSessionId ?? null,
        agent: input.agent,
        description: input.description,
        prompt_preview: input.promptPreview,
        created_at: input.createdAt,
        updated_at: input.createdAt,
      })
      .run()
    return db.select().from(taskInvocation).where(eq(taskInvocation.id, Number(result.lastInsertRowid))).get()!
  }

  function linkTask(parentSessionId: string, childSessionId: string) {
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
      .set({ child_session_id: childSessionId, updated_at: candidate.created_at })
      .where(eq(taskInvocation.id, candidate.id))
      .run()
    return db.select().from(taskInvocation).where(eq(taskInvocation.id, candidate.id)).get()!
  }

  function getTasksForSession(sessionId: string) {
    return db.select().from(taskInvocation).where(
      or(
        eq(taskInvocation.parent_session_id, sessionId),
        eq(taskInvocation.child_session_id, sessionId),
      ),
    ).all()
  }

  return { saveRelation, getAll, deleteRelation, upsertTask, linkTask, getTasksForSession }
}

describe('session_relation DB functions', () => {
  let db: ReturnType<typeof makeTestDb>

  beforeEach(() => {
    db = makeTestDb()
  })

  it('saves a relation and retrieves it', () => {
    db.saveRelation('session-a', 'session-b', 'linked')
    const rows = db.getAll()
    expect(rows).toHaveLength(1)
    expect(rows[0].from_session_id).toBe('session-a')
    expect(rows[0].to_session_id).toBe('session-b')
    expect(rows[0].relation_type).toBe('linked')
    expect(rows[0].id).toBe(1)
  })

  it('saves multiple relations independently', () => {
    db.saveRelation('a', 'b', 'linked')
    db.saveRelation('a', 'c', 'detached')
    db.saveRelation('b', 'c', 'detached')
    expect(db.getAll()).toHaveLength(3)
  })

  it('deletes by id', () => {
    db.saveRelation('a', 'b', 'linked')
    db.saveRelation('a', 'c', 'linked')
    const all = db.getAll()
    db.deleteRelation(all[0].id)
    const remaining = db.getAll()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(all[1].id)
  })

  it('deleting non-existent id is a no-op', () => {
    db.saveRelation('a', 'b', 'linked')
    db.deleteRelation(9999)
    expect(db.getAll()).toHaveLength(1)
  })
})

describe('task_invocation collaboration contract', () => {
  let db: ReturnType<typeof makeTestDb>

  beforeEach(() => {
    db = makeTestDb()
  })

  it('requires two independent child task results to satisfy the synthetic parent task', () => {
    db.upsertTask({
      parentSessionId: 'parent-1',
      messageId: 'msg-a',
      partId: 'prt_alpha',
      agent: 'explore',
      description: 'Find alpha token',
      promptPreview: 'Return only ALPHA',
      createdAt: '2026-04-07T00:00:01Z',
    })
    db.linkTask('parent-1', 'child-alpha')

    db.upsertTask({
      parentSessionId: 'parent-1',
      messageId: 'msg-b',
      partId: 'prt_beta',
      agent: 'explore',
      description: 'Find beta token',
      promptPreview: 'Return only BETA',
      createdAt: '2026-04-07T00:00:02Z',
    })
    db.linkTask('parent-1', 'child-beta')

    const childOutputs = new Map([
      ['child-alpha', 'ALPHA=RED-734'],
      ['child-beta', 'BETA=BLUE-912'],
    ])
    const taskRows = db.getTasksForSession('parent-1')
    const synthesized = taskRows
      .map((task) => task.child_session_id ? childOutputs.get(task.child_session_id) : undefined)
      .filter(Boolean)
      .join('\n')

    expect(taskRows.map((task) => task.child_session_id).sort()).toEqual(['child-alpha', 'child-beta'])
    expect(db.getTasksForSession('child-alpha')).toHaveLength(1)
    expect(db.getTasksForSession('child-beta')).toHaveLength(1)
    expect(synthesized).toContain('ALPHA=RED-734')
    expect(synthesized).toContain('BETA=BLUE-912')
    expect(synthesized.includes('ALPHA=RED-734') && synthesized.includes('BETA=BLUE-912')).toBe(true)
  })
})
