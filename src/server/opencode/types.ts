export type NodeStatus = 'running' | 'needs-permission' | 'needs-answer' | 'idle' | 'failed'

export type AgentreeSession = {
  id: string
  title: string
  parentID: string | null
  directory: string
  time: {
    created: number
    updated: number
  }
  share?: { url: string } | null
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
  permission?: PermissionRule[]
}

export type ForkSessionInput = {
  sessionID: string
  messageID?: string
}

export type SubtaskInput = {
  sessionID: string
  partID?: string
  prompt: string
  description?: string
  agent?: string
  model?: {
    providerID: string
    modelID: string
  }
}

export type PermissionReply = 'once' | 'always' | 'reject'

export type FileDiff = {
  file: string
  before: string
  after: string
  additions: number
  deletions: number
  status?: 'added' | 'deleted' | 'modified'
}

export type PermissionRule = {
  permission: string
  pattern: string
  action: 'allow' | 'deny' | 'ask'
}

export type AgentInfo = {
  name: string
  description?: string
  mode: 'subagent' | 'primary' | 'all'
  hidden?: boolean
  native?: boolean
}

export interface OpencodeAdapter {
  getCompatReport(): Promise<OpencodeCompatReport>
  listAgents(): Promise<AgentInfo[]>
  listSessions(): Promise<AgentreeSession[]>
  listStatuses(): Promise<Record<string, NodeStatus>>
  getSession(sessionID: string): Promise<AgentreeSession>
  getSessionMessages(sessionID: string, limit?: number): Promise<AgentreeMessage[]>
  getSessionChildren(sessionID: string): Promise<AgentreeSession[]>
  getSessionDiff(sessionID: string, messageID?: string): Promise<FileDiff[]>
  sendPrompt(sessionID: string, text: string): Promise<void>
  createSession(input: CreateSessionInput): Promise<AgentreeSession>
  forkSession(input: ForkSessionInput): Promise<AgentreeSession>
  sendSubtask(input: SubtaskInput): Promise<void>
  abortSession(sessionID: string): Promise<void>
  deleteSession(sessionID: string): Promise<void>
  revertSession(sessionID: string, messageID?: string, partID?: string): Promise<AgentreeSession>
  unrevertSession(sessionID: string): Promise<AgentreeSession>
  summarizeSession(sessionID: string, providerID?: string, modelID?: string): Promise<boolean>
  shareSession(sessionID: string): Promise<AgentreeSession>
  unshareSession(sessionID: string): Promise<AgentreeSession>
  replyPermission(requestID: string, reply: PermissionReply, message?: string): Promise<void>
  replyQuestion(requestID: string, answers: string[]): Promise<void>
  rejectQuestion(requestID: string): Promise<void>
  globalEventStream(): Promise<AsyncGenerator<unknown>>
}
