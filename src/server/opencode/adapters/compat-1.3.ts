import { opencode } from '../client.js'
import { getCompatReport } from '../compat.js'
import { normalizeEvent, normalizeMessage, normalizeSession, normalizeStatus } from '../normalize.js'
import type {
  AgentreeMessage,
  AgentreeSession,
  CreateSessionInput,
  ForkSessionInput,
  OpencodeAdapter,
  PermissionReply,
  SubtaskInput,
} from '../types.js'

function unwrapData<T>(result: { data?: T; error?: unknown }, fallbackMessage: string): T {
  if (result.error) throw new Error(String(result.error))
  if (result.data === undefined) throw new Error(fallbackMessage)
  return result.data
}

export const compat13Adapter: OpencodeAdapter = {
  getCompatReport,

  async listSessions(): Promise<AgentreeSession[]> {
    const data = unwrapData(await opencode.session.list(), 'Failed to load sessions') as Array<{
      id: string
      title: string
      parentID?: string
      directory: string
      time: { created: number; updated: number }
    }>
    return data.map(normalizeSession)
  },

  async listStatuses() {
    const data = unwrapData(await opencode.session.status(), 'Failed to load session statuses') as Record<string, { type: 'idle' | 'busy' | 'retry' }>
    return Object.fromEntries(Object.entries(data).map(([sessionID, status]) => [sessionID, normalizeStatus(status)]))
  },

  async getSession(sessionID) {
    const data = unwrapData(await opencode.session.get({ sessionID }), 'Failed to load session') as {
      id: string
      title: string
      parentID?: string
      directory: string
      time: { created: number; updated: number }
    }
    return normalizeSession(data)
  },

  async getSessionMessages(sessionID, limit) {
    const data = unwrapData(
      await opencode.session.messages({ sessionID, ...(limit ? { limit } : {}) }),
      'Failed to load session messages',
    ) as unknown[]
    return data.map(normalizeMessage) as AgentreeMessage[]
  },

  async sendPrompt(sessionID, text) {
    const result = await opencode.session.promptAsync({
      sessionID,
      parts: [{ type: 'text', text }],
    })
    if (result.error) throw new Error(String(result.error))
  },

  async createSession(input: CreateSessionInput) {
    const data = unwrapData(
      await opencode.session.create({
        ...(input.title ? { title: input.title } : {}),
        ...(input.parentID ? { parentID: input.parentID } : {}),
        ...(input.directory ? { directory: input.directory } : {}),
      }),
      'Failed to create session',
    ) as {
      id: string
      title: string
      parentID?: string
      directory: string
      time: { created: number; updated: number }
    }
    return normalizeSession(data)
  },

  async forkSession(input: ForkSessionInput) {
    const data = unwrapData(
      await opencode.session.fork({
        sessionID: input.sessionID,
        ...(input.messageID ? { messageID: input.messageID } : {}),
      }),
      'Failed to fork session',
    ) as {
      id: string
      title: string
      parentID?: string
      directory: string
      time: { created: number; updated: number }
    }
    return normalizeSession(data)
  },

  async sendSubtask(input: SubtaskInput) {
    const result = await opencode.session.promptAsync({
      sessionID: input.sessionID,
      parts: [{
        type: 'subtask',
        prompt: input.prompt,
        description: input.description ?? input.prompt.slice(0, 80),
        agent: input.agent ?? 'build',
        ...(input.model ? { model: input.model } : {}),
      }],
    })
    if (result.error) throw new Error(String(result.error))
  },

  async abortSession(sessionID) {
    const result = await opencode.session.abort({ sessionID })
    if (result.error) throw new Error(String(result.error))
  },

  async deleteSession(sessionID) {
    const result = await opencode.session.delete({ sessionID })
    if (result.error) throw new Error(String(result.error))
  },

  async replyPermission(requestID: string, reply: PermissionReply, message?: string) {
    const result = await opencode.permission.reply({ requestID, reply, ...(message ? { message } : {}) })
    if (result.error) throw new Error(String(result.error))
  },

  async replyQuestion(requestID, answers) {
    const result = await opencode.question.reply({ requestID, answers: [answers] })
    if (result.error) throw new Error(String(result.error))
  },

  async rejectQuestion(requestID) {
    const result = await opencode.question.reject({ requestID })
    if (result.error) throw new Error(String(result.error))
  },

  async globalEventStream() {
    const result = await opencode.global.event()
    async function* normalizedStream() {
      for await (const msg of result.stream) {
        const payload = (msg as { payload?: unknown }).payload
        const event = normalizeEvent(payload)
        if (event) yield event
      }
    }
    return normalizedStream()
  },
}
