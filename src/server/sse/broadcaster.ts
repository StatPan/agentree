import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { opencodeAdapter } from '../opencode/index.js'

type AnyEvent = { type: string; properties: Record<string, unknown> }

const clients = new Set<(event: AnyEvent) => void>()

function broadcast(event: AnyEvent) {
  for (const send of clients) {
    try { send(event) } catch {}
  }
}

function addClient(send: (event: AnyEvent) => void) {
  clients.add(send)
  return () => clients.delete(send)
}

export async function startOpencodeListener(): Promise<void> {
  try {
    const stream = await opencodeAdapter.globalEventStream()
    for await (const event of stream) {
      const payload = event as AnyEvent
      if (payload) broadcast(payload)
    }
  } catch (err) {
    console.error('[sse] opencode stream error, retrying in 3s:', err)
    await new Promise((r) => setTimeout(r, 3000))
    return startOpencodeListener()
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
