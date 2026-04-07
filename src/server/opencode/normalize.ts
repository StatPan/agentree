import type { AgentreeEvent, AgentreeMessage, AgentreeSession, NodeStatus } from './types.js'

type RawSession = {
  id: string
  title: string
  parentID?: string
  directory: string
  time: {
    created: number
    updated: number
  }
  share?: { url: string } | null
}

type RawStatus =
  | { type: 'idle' }
  | { type: 'busy' }
  | { type: 'retry' }
  | undefined

export function normalizeSession(session: RawSession): AgentreeSession {
  return {
    id: session.id,
    title: session.title,
    parentID: session.parentID ?? null,
    directory: session.directory,
    time: session.time,
    ...(session.share ? { share: session.share } : {}),
  }
}

export function normalizeStatus(status: RawStatus): NodeStatus {
  if (!status) return 'idle'
  if (status.type === 'idle') return 'idle'
  if (status.type === 'busy' || status.type === 'retry') return 'running'
  return 'idle'
}

export function normalizeMessage(message: unknown): AgentreeMessage {
  const bundle = message as {
    info: {
      id: string
      role: 'user' | 'assistant'
      error?: { name?: string; data?: { message?: string } }
      time?: { created?: number }
    }
    parts?: Array<{ id?: string; type: string; text?: string; [key: string]: unknown }>
  }

  return {
    info: bundle.info,
    parts: bundle.parts ?? [],
  }
}

function withRequestID(properties: Record<string, unknown>) {
  const requestID = properties.requestID
  const id = properties.id
  return {
    ...properties,
    ...(typeof requestID === 'string' ? { requestID } : typeof id === 'string' ? { requestID: id } : {}),
  }
}

function normalizeMessageEvent(properties: Record<string, unknown>) {
  const normalized = { ...properties }
  const part = normalized.part as { type?: string; text?: string; [key: string]: unknown } | undefined
  if (part && typeof part === 'object') {
    normalized.part = {
      ...part,
      ...(typeof part.text === 'string' ? { text: part.text } : {}),
    }
  }

  if (typeof normalized.delta === 'string') {
    normalized.delta = { type: 'text', text: normalized.delta }
  }

  return normalized
}

export function normalizeEvent(input: unknown): AgentreeEvent | null {
  const payload = input as { type?: string; properties?: Record<string, unknown> } | undefined
  if (!payload?.type || !payload.properties) return null

  let properties = { ...payload.properties }
  const info = properties.info as RawSession | undefined
  if (info?.id && info.directory && info.time) {
    properties = { ...properties, info: normalizeSession(info) }
  }

  switch (payload.type) {
    case 'permission.asked':
    case 'permission.replied':
      properties = withRequestID(properties)
      break
    case 'question.asked':
    case 'question.replied':
    case 'question.rejected':
      properties = withRequestID(properties)
      break
    case 'message.part.delta':
    case 'message.part.updated':
      properties = normalizeMessageEvent(properties)
      break
  }

  return {
    type: payload.type,
    properties,
  }
}
