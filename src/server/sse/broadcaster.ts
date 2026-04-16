import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { linkTaskInvocationToChild, upsertTaskInvocation } from '../db/index.js'
import { opencodeAdapter } from '../opencode/index.js'

type AnyEvent = { type: string; properties: Record<string, unknown> }

const clients = new Set<(event: AnyEvent) => void>()

// C2: Track connection state for health endpoint
let connected = false
export function isOpencodeConnected() { return connected }

// Phase 6: In-memory pending state for supervisor API
export type PendingPermission = {
  requestId: string
  sessionId: string
  message: string
  metadata: Record<string, unknown>
}
export type PendingQuestion = {
  requestId: string
  sessionId: string
  message: string
  metadata: Record<string, unknown>
}
const pendingPermissions = new Map<string, PendingPermission>()
const pendingQuestions = new Map<string, PendingQuestion>()

export function getPendingPermissions(): PendingPermission[] {
  return [...pendingPermissions.values()]
}
export function getPendingQuestions(): PendingQuestion[] {
  return [...pendingQuestions.values()]
}

function updatePendingState(event: AnyEvent) {
  const p = event.properties
  const sessionId = (typeof p.sessionID === 'string' ? p.sessionID : '') || ''
  const requestId = (typeof p.requestID === 'string' ? p.requestID : '') || ''

  if (event.type === 'permission.asked' || event.type === 'permission.updated') {
    if (!requestId || !sessionId) return
    pendingPermissions.set(requestId, {
      requestId,
      sessionId,
      message: typeof p.message === 'string' ? p.message : '',
      metadata: p,
    })
  } else if (event.type === 'permission.replied') {
    if (requestId) pendingPermissions.delete(requestId)
  } else if (event.type === 'question.asked' || event.type === 'question.updated') {
    if (!requestId || !sessionId) return
    pendingQuestions.set(requestId, {
      requestId,
      sessionId,
      message: typeof p.message === 'string' ? p.message : '',
      metadata: p,
    })
  } else if (event.type === 'question.replied' || event.type === 'question.rejected') {
    if (requestId) pendingQuestions.delete(requestId)
  }
}

function broadcast(event: AnyEvent) {
  for (const send of clients) {
    try { send(event) } catch {}
  }
}

export function trackTaskLineage(event: AnyEvent) {
  if (event.type === 'message.part.updated') {
    const part = event.properties.part as {
      id?: string
      sessionID?: string
      messageID?: string
      type?: string
      prompt?: string
      description?: string
      agent?: string
    } | undefined
    const parentSessionId = typeof event.properties.sessionID === 'string' ? event.properties.sessionID : part?.sessionID
    if (!parentSessionId || part?.type !== 'subtask') return
    upsertTaskInvocation({
      parentSessionId,
      messageId: typeof event.properties.messageID === 'string' ? event.properties.messageID : part.messageID,
      partId: part.id ?? null,
      agent: part.agent ?? 'unknown',
      description: part.description ?? part.prompt?.slice(0, 80) ?? 'Subtask',
      promptPreview: part.prompt?.slice(0, 500) ?? '',
    })
    return
  }

  if (event.type === 'session.created') {
    const info = event.properties.info as { id?: string; parentID?: string | null } | undefined
    if (info?.id && info.parentID) linkTaskInvocationToChild(info.parentID, info.id)
  }
}

function addClient(send: (event: AnyEvent) => void) {
  clients.add(send)
  return () => clients.delete(send)
}

// C2: Exponential backoff with max delay cap
const INITIAL_RETRY_MS = 1000
const MAX_RETRY_MS = 60_000

export async function startOpencodeListener(): Promise<void> {
  let retryMs = INITIAL_RETRY_MS

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const stream = await opencodeAdapter.globalEventStream()
      connected = true
      retryMs = INITIAL_RETRY_MS // reset on successful connection
      console.log('[sse] connected to opencode event stream')

      for await (const event of stream) {
        const payload = event as AnyEvent
        if (payload) {
          trackTaskLineage(payload)
          updatePendingState(payload)
          broadcast(payload)
        }
      }
      // Stream ended normally — reconnect
      connected = false
      console.warn('[sse] opencode stream ended, reconnecting...')
    } catch (err) {
      connected = false
      console.error(`[sse] opencode stream error, retrying in ${retryMs / 1000}s:`, err)
      await new Promise((r) => setTimeout(r, retryMs))
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
    }
  }
}

export async function sseHandler(c: Context) {
  return streamSSE(c, async (stream) => {
    let done = false
    const remove = addClient((event) => {
      if (!done) {
        stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {
          done = true
          remove()
        })
      }
    })

    const ping = setInterval(() => {
      if (!done) {
        stream.writeSSE({ event: 'ping', data: '' }).catch(() => {
          done = true
          clearInterval(ping)
          remove()
        })
      }
    }, 15000)

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        done = true
        clearInterval(ping)
        remove()
        resolve()
      })
    })
  })
}
