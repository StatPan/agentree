import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core'

export const project = sqliteTable('project', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  directory_key: text('directory_key').unique(),
  user_created: integer('user_created').default(0).notNull(),
  created_at: text('created_at').notNull().default("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"),
})

export const canvasNode = sqliteTable('canvas_node', {
  session_id: text('session_id').primaryKey(),
  label: text('label'),
  canvas_x: real('canvas_x').default(0).notNull(),
  canvas_y: real('canvas_y').default(0).notNull(),
  pinned: integer('pinned').default(0).notNull(),
  detached: integer('detached').default(0).notNull(),
  project_id: text('project_id'),
  updated_at: text('updated_at').default("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')").notNull(),
})

export const sessionFork = sqliteTable('session_fork', {
  session_id: text('session_id').primaryKey(),
  forked_from_session_id: text('forked_from_session_id').notNull(),
  created_at: text('created_at').default("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')").notNull(),
})

export const sessionRelation = sqliteTable('session_relation', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  from_session_id: text('from_session_id').notNull(),
  to_session_id: text('to_session_id').notNull(),
  relation_type: text('relation_type').notNull(),
  created_at: text('created_at').default("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')").notNull(),
})

export const taskInvocation = sqliteTable('task_invocation', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parent_session_id: text('parent_session_id').notNull(),
  message_id: text('message_id'),
  part_id: text('part_id'),
  child_session_id: text('child_session_id'),
  agent: text('agent').notNull(),
  description: text('description').notNull(),
  prompt_preview: text('prompt_preview').notNull(),
  created_at: text('created_at').default("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')").notNull(),
  updated_at: text('updated_at').default("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')").notNull(),
})

export type ProjectRow = typeof project.$inferSelect
export type CanvasNode = typeof canvasNode.$inferSelect
export type InsertCanvasNode = typeof canvasNode.$inferInsert
export type SessionFork = typeof sessionFork.$inferSelect
export type SessionRelation = typeof sessionRelation.$inferSelect
export type InsertSessionRelation = typeof sessionRelation.$inferInsert
export type TaskInvocation = typeof taskInvocation.$inferSelect
export type InsertTaskInvocation = typeof taskInvocation.$inferInsert
export type RelationType = 'fork' | 'linked' | 'detached'
