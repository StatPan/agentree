export type NodeStatus = 'running' | 'needs-permission' | 'needs-answer' | 'idle' | 'done' | 'failed'

export type AgentreeSession = {
  id: string
  title: string
  parentID: string | null
  directory: string
  time: {
    created: number
    updated: number
  }
}

export type AgentreeEvent = {
  type: string
  properties: Record<string, unknown>
}

export type AgentreeMessage = {
  info: {
    id: string
    role: 'user' | 'assistant'
    error?: { name?: string; data?: { message?: string } }
    time?: { created?: number }
  }
  parts: Array<{
    id?: string
    type: string
    text?: string
    [key: string]: unknown
  }>
}

export type CompatCapabilities = {
  supportsSessionCreate: boolean
  supportsSessionFork: boolean
  supportsSubtaskPrompt: boolean
  supportsTodo: boolean
  supportsDiff: boolean
  supportsShare: boolean
  questionReplyMode: 'string-array-array'
  sessionStatusMode: 'discriminated-union'
}

export type OpencodeCompatReport = {
  sdkVersion: string
  serverVersion: string | null
  profile: string
  capabilities: CompatCapabilities
  warnings: string[]
}

export type TreeResponse = {
  sessions: AgentreeSession[]
  statusBySession: Record<string, NodeStatus>
  compat: OpencodeCompatReport
}

export type CreateSessionInput = {
  title?: string
  parentID?: string
  directory?: string
}

export type ForkSessionInput = {
  sessionID: string
  messageID?: string
}

export type SubtaskInput = {
  sessionID: string
  prompt: string
  description?: string
  agent?: string
  model?: {
    providerID: string
    modelID: string
  }
}

export type PermissionReply = 'once' | 'always' | 'reject'

export interface OpencodeAdapter {
  getCompatReport(): Promise<OpencodeCompatReport>
  listSessions(): Promise<AgentreeSession[]>
  listStatuses(): Promise<Record<string, NodeStatus>>
  getSession(sessionID: string): Promise<AgentreeSession>
  getSessionMessages(sessionID: string, limit?: number): Promise<AgentreeMessage[]>
  sendPrompt(sessionID: string, text: string): Promise<void>
  createSession(input: CreateSessionInput): Promise<AgentreeSession>
  forkSession(input: ForkSessionInput): Promise<AgentreeSession>
  sendSubtask(input: SubtaskInput): Promise<void>
  abortSession(sessionID: string): Promise<void>
  replyPermission(requestID: string, reply: PermissionReply, message?: string): Promise<void>
  replyQuestion(requestID: string, answers: string[]): Promise<void>
  rejectQuestion(requestID: string): Promise<void>
  globalEventStream(): Promise<AsyncGenerator<unknown>>
}
