import { opencode } from '../client.js'
import { getCompatReport } from '../compat.js'
import { normalizeEvent, normalizeMessage, normalizeSession, normalizeStatus } from '../normalize.js'
import type {
  AgentreeMessage,
  AgentreeSession,
  AgentInfo,
  CreateSessionInput,
  FileDiff,
  ForkSessionInput,
  OpencodeAdapter,
  PermissionReply,
  SubtaskInput,
} from '../types.js'

function formatError(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  return JSON.stringify(err)
}

function unwrapData<T>(result: { data?: T; error?: unknown }, fallbackMessage: string): T {
  if (result.error) throw new Error(formatError(result.error))
  if (result.data === undefined) throw new Error(fallbackMessage)
  return result.data
}

function throwIfError(result: { error?: unknown }) {
  if (result.error) throw new Error(formatError(result.error))
}

export const compat13Adapter: OpencodeAdapter = {
  getCompatReport,

  async listAgents(): Promise<AgentInfo[]> {
    const data = unwrapData(await opencode.app.agents(), 'Failed to load agents') as AgentInfo[]
    return data
  },

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

  async getSessionChildren(sessionID) {
    const data = unwrapData(
      await opencode.session.children({ sessionID }),
      'Failed to load session children',
    ) as Array<{
      id: string
      title: string
      parentID?: string
      directory: string
      time: { created: number; updated: number }
    }>
    return data.map(normalizeSession)
  },

  async getSessionDiff(sessionID, messageID?) {
    const data = unwrapData(
      await opencode.session.diff({ sessionID, ...(messageID ? { messageID } : {}) }),
      'Failed to load session diff',
    ) as FileDiff[]
    return data
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
    throwIfError(result)
  },

  async createSession(input: CreateSessionInput) {
    const data = unwrapData(
      await opencode.session.create({
        ...(input.title ? { title: input.title } : {}),
        ...(input.parentID ? { parentID: input.parentID } : {}),
        ...(input.directory ? { directory: input.directory } : {}),
        ...(input.permission ? { permission: input.permission } : {}),
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
        ...(input.partID ? { id: input.partID } : {}),
        type: 'subtask',
        prompt: input.prompt,
        description: input.description ?? input.prompt.slice(0, 80),
        agent: input.agent ?? 'build',
        ...(input.model ? { model: input.model } : {}),
      }],
    })
    throwIfError(result)
  },

  async abortSession(sessionID) {
    const result = await opencode.session.abort({ sessionID })
    throwIfError(result)
  },

  async deleteSession(sessionID) {
    const result = await opencode.session.delete({ sessionID })
    throwIfError(result)
  },

  async revertSession(sessionID, messageID?, partID?) {
    const data = unwrapData(
      await opencode.session.revert({ sessionID, ...(messageID ? { messageID } : {}), ...(partID ? { partID } : {}) }),
      'Failed to revert session',
    ) as {
      id: string; title: string; parentID?: string; directory: string
      time: { created: number; updated: number }
    }
    return normalizeSession(data)
  },

  async unrevertSession(sessionID) {
    const data = unwrapData(
      await opencode.session.unrevert({ sessionID }),
      'Failed to unrevert session',
    ) as {
      id: string; title: string; parentID?: string; directory: string
      time: { created: number; updated: number }
    }
    return normalizeSession(data)
  },

  async summarizeSession(sessionID, providerID?, modelID?) {
    const data = unwrapData(
      await opencode.session.summarize({
        sessionID,
        ...(providerID ? { providerID } : {}),
        ...(modelID ? { modelID } : {}),
        ...(!providerID && !modelID ? { auto: true } : {}),
      }),
      'Failed to summarize session',
    )
    return Boolean(data)
  },

  async shareSession(sessionID) {
    const data = unwrapData(
      await opencode.session.share({ sessionID }),
      'Failed to share session',
    ) as {
      id: string; title: string; parentID?: string; directory: string
      time: { created: number; updated: number }; share?: { url: string } | null
    }
    return normalizeSession(data)
  },

  async unshareSession(sessionID) {
    const data = unwrapData(
      await opencode.session.unshare({ sessionID }),
      'Failed to unshare session',
    ) as {
      id: string; title: string; parentID?: string; directory: string
      time: { created: number; updated: number }
    }
    return normalizeSession(data)
  },

  async replyPermission(requestID: string, reply: PermissionReply, message?: string) {
    const result = await opencode.permission.reply({ requestID, reply, ...(message ? { message } : {}) })
    throwIfError(result)
  },

  async replyQuestion(requestID, answers) {
    const result = await opencode.question.reply({ requestID, answers: [answers] })
    throwIfError(result)
  },

  async rejectQuestion(requestID) {
    const result = await opencode.question.reject({ requestID })
    throwIfError(result)
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
