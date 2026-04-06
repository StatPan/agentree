import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { sessionRelation } from './schema.js'

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
    )
  `)
  const db = drizzle(sqlite, { schema: { sessionRelation } })

  function saveRelation(from: string, to: string, type: string) {
    db.insert(sessionRelation).values({ from_session_id: from, to_session_id: to, relation_type: type as never }).run()
  }

  function getAll() {
    return db.select().from(sessionRelation).all()
  }

  function deleteRelation(id: number) {
    db.delete(sessionRelation).where(eq(sessionRelation.id, id)).run()
  }

  return { saveRelation, getAll, deleteRelation }
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
    db.saveRelation('a', 'c', 'merged-view')
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
