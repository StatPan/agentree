import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { opencodeAdapter } from '../opencode/index.js'

type AnyEvent = { type: string; properties: Record<string, unknown> }

const clients = new Set<(event: AnyEvent) => void>()

// C2: Track connection state for health endpoint
let connected = false
export function isOpencodeConnected() { return connected }

function broadcast(event: AnyEvent) {
  for (const send of clients) {
    try { send(event) } catch {}
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
        if (payload) broadcast(payload)
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
