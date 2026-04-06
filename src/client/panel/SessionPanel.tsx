import { useEffect, useMemo, useState } from 'react'
import { useAgentStore } from '../store/agentStore'

// ─── Types ───────────────────────────────────────────────────────────────────

type ChildPendingItem = {
  childId: string
  childLabel: string
  type: 'permission' | 'question'
  payload: unknown
}

type ToolState =
  | { status: 'pending' }
  | { status: 'running'; input: unknown }
  | { status: 'completed'; input: unknown; output: unknown; time?: { start: number; end: number } }
  | { status: 'error'; input: unknown; error: unknown }

type MessagePart =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'reasoning'; text: string }
  | { id: string; type: 'tool'; callID: string; tool: string; state: ToolState; metadata?: unknown }
  | { id: string; type: 'patch'; hash: string; files: Array<{ filename: string; additions?: number; deletions?: number }> }
  | { id: string; type: 'subtask'; prompt: string; description?: string; agent: string; model?: unknown }
  | { id: string; type: 'file'; mime: string; filename?: string; url: string }
  | { id: string; type: 'step-finish'; reason: string; cost: number; tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } } }
  | { id: string; type: 'agent'; name: string }
  | { id: string; type: 'retry'; attempt: number; error: unknown }
  | { id: string; type: 'compaction'; auto: boolean }
  | { id: string; type: string }

type SessionMessage = {
  info: {
    id: string
    role: 'user' | 'assistant'
    error?: { name?: string; data?: { message?: string } }
    time?: { created?: number; completed?: number }
    modelID?: string
    providerID?: string
    cost?: number
    tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
    path?: { cwd: string; root: string }
    agent?: string
  }
  parts: MessagePart[]
}

type SessionDetails = {
  id: string
  title?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(value?: number) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

function formatCost(cost: number) {
  if (cost === 0) return '$0'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(3)}`
}

function formatTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function truncateCwd(cwd: string) {
  if (cwd.length <= 40) return cwd
  const parts = cwd.split('/')
  if (parts.length <= 3) return cwd
  return `…/${parts.slice(-2).join('/')}`
}

function summarize(value: unknown, maxLen = 120): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.slice(0, maxLen)
  try {
    const s = JSON.stringify(value)
    return s.slice(0, maxLen) + (s.length > maxLen ? '…' : '')
  } catch {
    return String(value).slice(0, maxLen)
  }
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function smallBtn(bg: string, color: string) {
  return {
    appearance: 'none' as const,
    border: 'none',
    borderRadius: 6,
    padding: '4px 8px',
    background: bg,
    color,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  }
}

const inputStyle = {
  width: '100%',
  background: '#0b0b0b',
  color: '#e5e7eb',
  border: '1px solid #27272a',
  borderRadius: 8,
  padding: 10,
  resize: 'vertical' as const,
  fontSize: 12,
  lineHeight: 1.5,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  boxSizing: 'border-box' as const,
}

function buttonStyle(background: string, color: string) {
  return {
    appearance: 'none' as const,
    border: 'none',
    borderRadius: 8,
    padding: '8px 12px',
    background,
    color,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
  }
}

// ─── Part rendering ───────────────────────────────────────────────────────────

function ToolStateDot({ state }: { state: ToolState }) {
  const color =
    state.status === 'pending' ? '#6b7280'
    : state.status === 'running' ? '#eab308'
    : state.status === 'completed' ? '#22c55e'
    : '#ef4444'
  const isRunning = state.status === 'running'
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        ...(isRunning ? { animation: 'agentree-pulse 1s ease-in-out infinite' } : {}),
      }}
    />
  )
}

function PartRow({ part }: { part: MessagePart }) {
  const [expanded, setExpanded] = useState(false)

  if (part.type === 'text') {
    return (
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#d1d5db', fontSize: 12, lineHeight: 1.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
        {part.text}
      </pre>
    )
  }

  if (part.type === 'reasoning') {
    return (
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#6b7280', fontSize: 11, lineHeight: 1.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontStyle: 'italic' }}>
        ⟳ {part.text}
      </pre>
    )
  }

  if (part.type === 'tool') {
    const inputStr = summarize('input' in part.state ? (part.state as { input: unknown }).input : undefined, 120)
    const outputStr = 'output' in part.state ? summarize((part.state as { output: unknown }).output, 500) : null
    const errorStr = 'error' in part.state ? summarize((part.state as { error: unknown }).error, 200) : null
    return (
      <div style={{ fontSize: 11, lineHeight: 1.4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: inputStr ? 4 : 0 }}>
          <span style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 4, padding: '1px 6px', color: '#7dd3fc', fontFamily: 'monospace', fontSize: 11 }}>
            {part.tool}
          </span>
          <ToolStateDot state={part.state} />
          <span style={{ color: '#4b5563', fontSize: 10 }}>{part.state.status}</span>
        </div>
        {inputStr && (
          <pre style={{ margin: 0, color: '#94a3b8', fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0d1117', borderRadius: 4, padding: '4px 6px', marginBottom: (outputStr || errorStr) ? 4 : 0 }}>
            {inputStr}
          </pre>
        )}
        {(outputStr || errorStr) && (
          <div>
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{ background: 'none', border: 'none', color: '#374151', fontSize: 10, cursor: 'pointer', padding: 0, marginBottom: expanded ? 4 : 0 }}
            >
              {expanded ? '▾ hide output' : '▸ show output'}
            </button>
            {expanded && (
              <pre style={{ margin: 0, color: errorStr ? '#fca5a5' : '#86efac', fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0d1117', borderRadius: 4, padding: '4px 6px' }}>
                {errorStr ?? outputStr}
              </pre>
            )}
          </div>
        )}
      </div>
    )
  }

  if (part.type === 'patch') {
    return (
      <div style={{ fontSize: 11 }}>
        <div style={{ color: '#94a3b8', marginBottom: 4 }}>
          <span style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 4, padding: '1px 6px', color: '#c4b5fd', fontFamily: 'monospace', fontSize: 10, marginRight: 6 }}>PATCH</span>
          {part.files.length} file{part.files.length !== 1 ? 's' : ''}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {part.files.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontFamily: 'monospace', fontSize: 10 }}>
              <span style={{ color: '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</span>
              {(f.additions ?? 0) > 0 && <span style={{ color: '#4ade80' }}>+{f.additions}</span>}
              {(f.deletions ?? 0) > 0 && <span style={{ color: '#f87171' }}>-{f.deletions}</span>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (part.type === 'subtask') {
    return (
      <div style={{ borderLeft: '2px solid #14b8a6', paddingLeft: 8, fontSize: 11 }}>
        <div style={{ color: '#5eead4', marginBottom: 3 }}>
          <span style={{ background: '#134e4a', borderRadius: 4, padding: '1px 6px', fontSize: 10, marginRight: 6 }}>SUBTASK</span>
          <span style={{ color: '#6b7280' }}>agent: {part.agent}</span>
        </div>
        <pre style={{ margin: 0, color: '#94a3b8', fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {'>'} {part.prompt.slice(0, 200)}
        </pre>
      </div>
    )
  }

  if (part.type === 'file') {
    const isImage = part.mime.startsWith('image/')
    return (
      <div style={{ fontSize: 11 }}>
        <span style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 4, padding: '1px 6px', color: '#fde68a', fontFamily: 'monospace', fontSize: 10, marginRight: 6 }}>
          {part.mime}
        </span>
        <span style={{ color: '#9ca3af' }}>{part.filename ?? 'file'}</span>
        {isImage && <img src={part.url} alt={part.filename ?? 'file'} style={{ display: 'block', maxWidth: 120, marginTop: 4, borderRadius: 4 }} />}
      </div>
    )
  }

  if (part.type === 'step-finish') {
    return (
      <div style={{ color: '#374151', fontSize: 10, textAlign: 'right', fontFamily: 'monospace' }}>
        {formatCost(part.cost)} · {formatTokens(part.tokens.input)} in / {formatTokens(part.tokens.output)} out
        {part.tokens.reasoning > 0 && ` / ${formatTokens(part.tokens.reasoning)} reasoning`}
      </div>
    )
  }

  if (part.type === 'agent') {
    return (
      <div style={{ color: '#6b7280', fontSize: 11, fontStyle: 'italic' }}>
        ↳ agent: {part.name}
      </div>
    )
  }

  if (part.type === 'retry') {
    const errMsg = summarize(part.error, 80)
    return (
      <div style={{ color: '#f97316', fontSize: 11 }}>
        ⚠ retry #{part.attempt}{errMsg ? `: ${errMsg}` : ''}
      </div>
    )
  }

  // fallback for unknown types
  const p = part as { type: string }
  return (
    <div style={{ color: '#374151', fontSize: 10, fontFamily: 'monospace' }}>
      [{p.type}]
    </div>
  )
}

function MessagePartList({ parts }: { parts: MessagePart[] }) {
  const visible = parts.filter(
    (p) => p.type !== 'step-start' && p.type !== 'snapshot' && p.type !== 'compaction',
  )
  if (visible.length === 0) return <span style={{ color: '#4b5563', fontSize: 11 }}>(no content)</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {visible.map((part) => (
        <PartRow key={part.id} part={part} />
      ))}
    </div>
  )
}

// ─── Child pending rows ───────────────────────────────────────────────────────

function ChildPermissionRow({
  item,
  onReply,
  onFocus,
}: {
  item: ChildPendingItem
  onReply: (childId: string, reply: 'once' | 'always' | 'reject') => void
  onFocus: (childId: string) => void
}) {
  const p = item.payload as { title?: string; command?: string; description?: string }
  const desc = p.title ?? p.command ?? p.description ?? 'Permission requested'
  return (
    <div style={{ padding: '8px 16px', borderTop: '1px solid #1f2937', background: '#0d1117' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <button
          onClick={() => onFocus(item.childId)}
          style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          {item.childLabel}
        </button>
        <span style={{ background: '#7c3f00', color: '#fde68a', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
          PERMISSION
        </span>
      </div>
      <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {desc}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onReply(item.childId, 'once')} style={smallBtn('#eab308', '#111')}>Once</button>
        <button onClick={() => onReply(item.childId, 'always')} style={smallBtn('#22c55e', '#111')}>Always</button>
        <button onClick={() => onReply(item.childId, 'reject')} style={smallBtn('#374151', '#e5e7eb')}>Deny</button>
      </div>
    </div>
  )
}

function ChildQuestionRow({
  item,
  answer,
  setAnswer,
  onSubmit,
  onReject,
  onFocus,
}: {
  item: ChildPendingItem
  answer: string
  setAnswer: (value: string) => void
  onSubmit: (childId: string) => void
  onReject: (childId: string) => void
  onFocus: (childId: string) => void
}) {
  const q = item.payload as { questions?: Array<{ question?: string; label?: string }> }
  const firstQ = q.questions?.[0]
  const questionText = firstQ?.question ?? firstQ?.label ?? 'Question asked'
  return (
    <div style={{ padding: '8px 16px', borderTop: '1px solid #1f2937', background: '#0d1117' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <button
          onClick={() => onFocus(item.childId)}
          style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          {item.childLabel}
        </button>
        <span style={{ background: '#7c2d00', color: '#fed7aa', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
          QUESTION
        </span>
      </div>
      <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>{questionText}</div>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={2}
        placeholder="Type answer…"
        style={{
          width: '100%',
          background: '#111827',
          color: '#e5e7eb',
          border: '1px solid #27272a',
          borderRadius: 6,
          padding: '5px 7px',
          fontSize: 11,
          resize: 'none',
          fontFamily: 'ui-monospace, monospace',
          boxSizing: 'border-box',
          marginBottom: 6,
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit(item.childId)
          }
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onSubmit(item.childId)} style={smallBtn('#f97316', '#111')}>Submit</button>
        <button onClick={() => onReject(item.childId)} style={smallBtn('#374151', '#e5e7eb')}>Reject</button>
      </div>
    </div>
  )
}

// ─── Todo list ────────────────────────────────────────────────────────────────

type TodoItem = { id: string; description: string; status: string }

function TodoList({ todos }: { todos: TodoItem[] }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ borderBottom: '1px solid #1f2937' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px 8px', display: 'flex', alignItems: 'center', gap: 6, color: '#7dd3fc', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        <span>{open ? '▾' : '▸'}</span>
        Todos ({todos.length})
      </button>
      {open && (
        <div style={{ padding: '0 16px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {todos.map((todo) => {
            const icon =
              todo.status === 'complete' ? '✓'
              : todo.status === 'in-progress' ? '◉'
              : todo.status === 'cancelled' ? '✗'
              : '○'
            const color =
              todo.status === 'complete' ? '#4ade80'
              : todo.status === 'in-progress' ? '#60a5fa'
              : todo.status === 'cancelled' ? '#6b7280'
              : '#9ca3af'
            return (
              <div key={todo.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11 }}>
                <span style={{ color, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                <span style={{ color: todo.status === 'cancelled' ? '#4b5563' : '#d1d5db', textDecoration: todo.status === 'cancelled' ? 'line-through' : 'none', lineHeight: 1.4 }}>
                  {todo.description}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const EMPTY_TODOS: TodoItem[] = []
const EMPTY_DIFF = null

// ─── Main panel ───────────────────────────────────────────────────────────────

export function SessionPanel({ sessionId }: { sessionId: string }) {
  const node = useAgentStore((s) => s.nodes.find((item) => item.id === sessionId))
  const selectedSession = useAgentStore((s) => s.sessions.find((item) => item.id === sessionId) ?? null)
  const pendingPermission = useAgentStore((s) => s.pendingPermissions[sessionId] ?? null)
  const pendingQuestion = useAgentStore((s) => s.pendingQuestions[sessionId] ?? null)
  const sessions = useAgentStore((s) => s.sessions)
  const pendingPermissions = useAgentStore((s) => s.pendingPermissions)
  const pendingQuestions = useAgentStore((s) => s.pendingQuestions)
  const nodes = useAgentStore((s) => s.nodes)
  const todos = useAgentStore((s) => s.todosBySession[sessionId] ?? EMPTY_TODOS)
  const diff = useAgentStore((s) => s.diffBySession[sessionId] ?? EMPTY_DIFF)
  const allRelations = useAgentStore((s) => s.relations)
  const lastActivity = useAgentStore((s) => s.lastActivityBySession[sessionId])
  const setSelectedSession = useAgentStore((s) => s.setSelectedSession)
  const setSubtaskTargetSession = useAgentStore((s) => s.setSubtaskTargetSession)
  const applySessionTree = useAgentStore((s) => s.applySessionTree)
  const addRelation = useAgentStore((s) => s.addRelation)
  const removeRelation = useAgentStore((s) => s.removeRelation)

  const [session, setSession] = useState<SessionDetails | null>(null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [prompt, setPrompt] = useState('')
  const [questionAnswer, setQuestionAnswer] = useState('')
  const [childAnswers, setChildAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkTarget, setLinkTarget] = useState('')
  const [linkType, setLinkType] = useState<'linked' | 'merged-view' | 'detached'>('linked')

  const status = node?.data.status ?? 'idle'
  const title = node?.data.label || session?.title || `${sessionId.slice(0, 8)}…`
  const forkSourceSessionId = selectedSession?.forkedFromSessionID ?? null
  const forkSourceLabel = forkSourceSessionId
    ? ((nodes.find((item) => item.id === forkSourceSessionId)?.data.label as string | undefined)
      ?? sessions.find((item) => item.id === forkSourceSessionId)?.title
      ?? `${forkSourceSessionId.slice(0, 8)}…`)
    : null

  // Derived session metadata from messages
  const firstAssistant = messages.find((m) => m.info.role === 'assistant')
  const metaModel = firstAssistant?.info.modelID
  const metaProvider = firstAssistant?.info.providerID
  const metaCwd = firstAssistant?.info.path?.cwd
  const totalCost = messages.reduce((sum, m) => sum + (m.info.cost ?? 0), 0)
  const totalTokens = messages.reduce(
    (sum, m) => sum + (m.info.tokens?.input ?? 0) + (m.info.tokens?.output ?? 0),
    0,
  )
  const hasMetadata = metaModel || metaCwd || totalCost > 0

  const questionItems = useMemo(() => {
    const value = pendingQuestion
    if (!value || typeof value !== 'object') return []
    const maybeQuestions = (value as { questions?: Array<{ id?: string; question?: string; label?: string }> }).questions
    return Array.isArray(maybeQuestions) ? maybeQuestions : []
  }, [pendingQuestion])

  const childPendingItems = useMemo((): ChildPendingItem[] => {
    const children = sessions.filter((s) => s.parentID === sessionId)
    const items: ChildPendingItem[] = []
    for (const child of children) {
      const childLabel = (nodes.find((n) => n.id === child.id)?.data.label as string | undefined) ?? child.id.slice(0, 8)
      if (pendingPermissions[child.id]) items.push({ childId: child.id, childLabel, type: 'permission', payload: pendingPermissions[child.id] })
      if (pendingQuestions[child.id]) items.push({ childId: child.id, childLabel, type: 'question', payload: pendingQuestions[child.id] })
    }
    return items
  }, [sessions, sessionId, pendingPermissions, pendingQuestions, nodes])

  const sessionRelations = useMemo(
    () => allRelations.filter(
      (r) => (r.from_session_id === sessionId || r.to_session_id === sessionId) && r.relation_type !== 'fork'
    ),
    [allRelations, sessionId],
  )

  // Initial load
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setQuestionAnswer('')

    Promise.all([
      fetch(`/api/session/${sessionId}`).then((r) => r.json()),
      fetch(`/api/session/${sessionId}/messages?limit=50`).then((r) => r.json()),
    ])
      .then(([sessionData, messagesData]) => {
        if (cancelled) return
        setSession(sessionData)
        setMessages(Array.isArray(messagesData) ? messagesData : [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [sessionId])

  // Live refresh on SSE activity (debounced)
  useEffect(() => {
    if (!lastActivity) return
    const t = setTimeout(() => {
      void refreshMessages()
    }, 600)
    return () => clearTimeout(t)
  }, [lastActivity]) // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshTree() {
    const response = await fetch('/api/tree')
    const data = await response.json()
    applySessionTree(data)
  }

  async function refreshMessages() {
    const res = await fetch(`/api/session/${sessionId}/messages?limit=50`)
    const data = await res.json()
    setMessages(Array.isArray(data) ? data : [])
  }

  async function sendPrompt() {
    const text = prompt.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/session/${sessionId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error('Failed to send prompt')
      setPrompt('')
      await refreshMessages()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  async function abortSession() {
    setError(null)
    try {
      const res = await fetch(`/api/session/${sessionId}/abort`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to abort session')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function forkSession() {
    setError(null)
    try {
      const response = await fetch(`/api/session/${sessionId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json()
      if (!response.ok) throw new Error('Failed to fork session')
      await refreshTree()
      if (data?.id) setSelectedSession(data.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function replyPermission(reply: 'once' | 'always' | 'reject') {
    if (!pendingPermission || typeof pendingPermission !== 'object') return
    const requestID = (pendingPermission as { requestID?: string; id?: string }).requestID
      ?? (pendingPermission as { requestID?: string; id?: string }).id
    if (!requestID) return
    const res = await fetch(`/api/permission/${requestID}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    })
    if (!res.ok) throw new Error('Failed to reply to permission request')
  }

  async function submitQuestion() {
    if (!pendingQuestion || typeof pendingQuestion !== 'object') return
    const requestID = (pendingQuestion as { requestID?: string; id?: string }).requestID
      ?? (pendingQuestion as { requestID?: string; id?: string }).id
    const firstQuestion = questionItems[0]
    if (!requestID || !firstQuestion?.id || !questionAnswer.trim()) return
    const res = await fetch(`/api/question/${requestID}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: [{ questionID: firstQuestion.id, value: questionAnswer.trim() }],
      }),
    })
    if (!res.ok) throw new Error('Failed to answer question')
    setQuestionAnswer('')
  }

  async function rejectQuestion() {
    if (!pendingQuestion || typeof pendingQuestion !== 'object') return
    const requestID = (pendingQuestion as { requestID?: string; id?: string }).requestID
      ?? (pendingQuestion as { requestID?: string; id?: string }).id
    if (!requestID) return
    const res = await fetch(`/api/question/${requestID}/reject`, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to reject question')
  }

  async function replyChildPermission(childId: string, reply: 'once' | 'always' | 'reject') {
    const p = pendingPermissions[childId] as { requestID?: string; id?: string } | undefined
    const requestID = p?.requestID ?? p?.id
    if (!requestID) return
    await fetch(`/api/permission/${requestID}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    })
  }

  async function submitChildQuestion(childId: string) {
    const q = pendingQuestions[childId] as { requestID?: string; id?: string; questions?: Array<{ id?: string }> } | undefined
    const requestID = q?.requestID ?? q?.id
    const firstQ = q?.questions?.[0]
    const answer = childAnswers[childId]?.trim()
    if (!requestID || !firstQ?.id || !answer) return
    await fetch(`/api/question/${requestID}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: [{ questionID: firstQ.id, value: answer }] }),
    })
    setChildAnswers((prev) => { const next = { ...prev }; delete next[childId]; return next })
  }

  async function rejectChildQuestion(childId: string) {
    const q = pendingQuestions[childId] as { requestID?: string; id?: string } | undefined
    const requestID = q?.requestID ?? q?.id
    if (!requestID) return
    await fetch(`/api/question/${requestID}/reject`, { method: 'POST' })
  }

  return (
    <>
      {/* Pulse animation for running tool dots */}
      <style>{`
        @keyframes agentree-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <div
        style={{
          width: 380,
          height: '100%',
          background: '#111',
          borderLeft: '1px solid #1f2937',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #1f2937' }}>
          <div style={{ color: '#f3f4f6', fontSize: 14, fontWeight: 600 }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{ color: '#9ca3af', fontSize: 12, fontFamily: 'monospace' }}>{sessionId}</span>
            <span
              style={{
                fontSize: 11,
                color: '#111',
                background: status === 'running' ? '#22c55e' : status === 'needs-permission' ? '#eab308' : status === 'needs-answer' ? '#f97316' : status === 'failed' ? '#ef4444' : '#60a5fa',
                padding: '2px 6px',
                borderRadius: 999,
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              {status}
            </span>
          </div>

          {/* Fork source */}
          {forkSourceSessionId && forkSourceLabel && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', color: '#99f6e4', background: '#134e4a', padding: '2px 6px', borderRadius: 999 }}>
                FORK
              </span>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>Forked from</span>
              <button
                onClick={() => setSelectedSession(forkSourceSessionId)}
                style={{ background: 'none', border: 'none', color: '#5eead4', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}
              >
                {forkSourceLabel}
              </button>
            </div>
          )}

          {/* session.diff hint */}
          {diff && (diff.summary || (diff.changedFiles?.length ?? 0) > 0) && (
            <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'monospace', color: '#6b7280' }}>
              {diff.summary && <span>Δ {diff.summary}</span>}
              {(diff.changedFiles?.length ?? 0) > 0 && !diff.summary && (
                <span>Δ {diff.changedFiles!.length} file{diff.changedFiles!.length !== 1 ? 's' : ''} changed</span>
              )}
            </div>
          )}

          {/* Session metadata */}
          {hasMetadata && (
            <div style={{ marginTop: 10, background: '#0d1117', borderRadius: 6, padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {(metaModel || metaProvider) && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: '#4b5563', width: 44, flexShrink: 0 }}>model</span>
                  <span style={{ color: '#e5e7eb' }}>
                    {metaModel ?? ''}
                    {metaProvider && <span style={{ color: '#6b7280' }}> · {metaProvider}</span>}
                  </span>
                </div>
              )}
              {metaCwd && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: '#4b5563', width: 44, flexShrink: 0 }}>cwd</span>
                  <span style={{ color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truncateCwd(metaCwd)}</span>
                </div>
              )}
              {totalCost > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: '#4b5563', width: 44, flexShrink: 0 }}>cost</span>
                  <span style={{ color: '#9ca3af' }}>
                    {formatCost(totalCost)}
                    {totalTokens > 0 && <span style={{ color: '#4b5563' }}> · {formatTokens(totalTokens)} tokens</span>}
                  </span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setSubtaskTargetSession(sessionId)} style={buttonStyle('#2563eb', '#fff')}>Spawn subtask</button>
            <button onClick={() => void forkSession()} style={buttonStyle('#0f766e', '#fff')}>Fork session</button>
          </div>
        </div>

        {/* Permission */}
        {pendingPermission && (
          <div style={{ padding: 16, borderBottom: '1px solid #1f2937', background: '#171717' }}>
            <div style={{ color: '#fef3c7', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Permission Request</div>
            <div style={{ color: '#d1d5db', fontSize: 13, marginBottom: 12 }}>
              {String((pendingPermission as { title?: string }).title ?? 'This session is waiting for permission.')}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => void replyPermission('once')} style={buttonStyle('#eab308', '#111')}>Allow once</button>
              <button onClick={() => void replyPermission('always')} style={buttonStyle('#22c55e', '#111')}>Always allow</button>
              <button onClick={() => void replyPermission('reject')} style={buttonStyle('#ef4444', '#fff')}>Deny</button>
            </div>
          </div>
        )}

        {/* Question */}
        {pendingQuestion && (
          <div style={{ padding: 16, borderBottom: '1px solid #1f2937', background: '#171717' }}>
            <div style={{ color: '#fed7aa', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Question</div>
            <div style={{ color: '#d1d5db', fontSize: 13, marginBottom: 10 }}>
              {questionItems[0]?.question ?? questionItems[0]?.label ?? 'This session is waiting for an answer.'}
            </div>
            <textarea
              value={questionAnswer}
              onChange={(e) => setQuestionAnswer(e.target.value)}
              rows={3}
              placeholder="Type your answer"
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => void submitQuestion()} style={buttonStyle('#f97316', '#111')}>Submit</button>
              <button onClick={() => void rejectQuestion()} style={buttonStyle('#374151', '#fff')}>Reject</button>
            </div>
          </div>
        )}

        {/* Child sessions pending */}
        {childPendingItems.length > 0 && (
          <div style={{ borderBottom: '1px solid #1f2937' }}>
            <div style={{ padding: '10px 16px 6px', color: '#7dd3fc', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Child Sessions Waiting ({childPendingItems.length})
            </div>
            {childPendingItems.map((item) =>
              item.type === 'permission' ? (
                <ChildPermissionRow
                  key={`p-${item.childId}`}
                  item={item}
                  onReply={replyChildPermission}
                  onFocus={setSelectedSession}
                />
              ) : (
                <ChildQuestionRow
                  key={`q-${item.childId}`}
                  item={item}
                  answer={childAnswers[item.childId] ?? ''}
                  setAnswer={(value) => setChildAnswers((prev) => ({ ...prev, [item.childId]: value }))}
                  onSubmit={submitChildQuestion}
                  onReject={rejectChildQuestion}
                  onFocus={setSelectedSession}
                />
              )
            )}
          </div>
        )}

        {/* Todos */}
        {todos.length > 0 && <TodoList todos={todos} />}

        {/* Relations */}
        <div style={{ borderBottom: '1px solid #1f2937' }}>
          <div style={{ padding: '10px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#7dd3fc', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Relations{sessionRelations.length > 0 ? ` (${sessionRelations.length})` : ''}
            </span>
            <button
              onClick={() => { setLinkOpen((v) => !v); setLinkTarget('') }}
              style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#9ca3af', fontSize: 10, cursor: 'pointer', padding: '2px 7px' }}
            >
              {linkOpen ? '✕' : '+ Link'}
            </button>
          </div>
          {sessionRelations.map((rel) => {
            const otherId = rel.from_session_id === sessionId ? rel.to_session_id : rel.from_session_id
            const otherNode = nodes.find((n) => n.id === otherId)
            const otherLabel = (otherNode?.data.label as string | undefined) ?? sessions.find((s) => s.id === otherId)?.title ?? `${otherId.slice(0, 8)}…`
            const typeColor = rel.relation_type === 'linked' ? '#818cf8' : rel.relation_type === 'merged-view' ? '#a78bfa' : '#6b7280'
            const direction = rel.from_session_id === sessionId ? '→' : '←'
            return (
              <div key={rel.id} style={{ padding: '4px 16px 4px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{ color: typeColor, fontFamily: 'monospace', fontSize: 10, background: '#1e293b', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
                  {rel.relation_type}
                </span>
                <span style={{ color: '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {direction} {otherLabel}
                </span>
                <button
                  onClick={() => void removeRelation(rel.id)}
                  style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 13, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            )
          })}
          {linkOpen && (
            <div style={{ padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <select
                value={linkTarget}
                onChange={(e) => setLinkTarget(e.target.value)}
                style={{ background: '#0b0b0b', color: '#e5e7eb', border: '1px solid #27272a', borderRadius: 6, padding: '5px 7px', fontSize: 11, width: '100%' }}
              >
                <option value="">Select session…</option>
                {sessions.filter((s) => s.id !== sessionId).map((s) => {
                  const label = (nodes.find((n) => n.id === s.id)?.data.label as string | undefined) ?? s.title ?? `${s.id.slice(0, 8)}…`
                  return <option key={s.id} value={s.id}>{label}</option>
                })}
              </select>
              <select
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as 'linked' | 'merged-view' | 'detached')}
                style={{ background: '#0b0b0b', color: '#e5e7eb', border: '1px solid #27272a', borderRadius: 6, padding: '5px 7px', fontSize: 11, width: '100%' }}
              >
                <option value="linked">linked</option>
                <option value="merged-view">merged-view</option>
                <option value="detached">detached</option>
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={async () => {
                    if (!linkTarget) return
                    await addRelation(sessionId, linkTarget, linkType)
                    setLinkOpen(false)
                    setLinkTarget('')
                  }}
                  disabled={!linkTarget}
                  style={smallBtn(!linkTarget ? '#1f2937' : '#374151', !linkTarget ? '#4b5563' : '#e5e7eb')}
                >
                  Connect
                </button>
                <button onClick={() => { setLinkOpen(false); setLinkTarget('') }} style={smallBtn('#111', '#6b7280')}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ color: '#6b7280', fontSize: 13 }}>Loading session…</div>
          ) : messages.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13 }}>No messages yet.</div>
          ) : (
            messages.map((message) => (
              <div
                key={message.info.id}
                style={{
                  background: message.info.role === 'user' ? '#161f2d' : '#191919',
                  border: `1px solid ${message.info.role === 'user' ? '#1d4ed8' : '#27272a'}`,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                  <span style={{ color: '#e5e7eb', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                    {message.info.role}
                  </span>
                  <span style={{ color: '#6b7280', fontSize: 11 }}>{formatTime(message.info.time?.created)}</span>
                </div>
                <MessagePartList parts={message.parts} />
                {message.info.error?.data?.message && (
                  <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 6 }}>
                    {message.info.error.data.message}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Prompt input */}
        <div style={{ padding: 16, borderTop: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div style={{ color: '#fca5a5', fontSize: 12 }}>{error}</div>}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Send a prompt to this session"
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void sendPrompt()} disabled={sending} style={buttonStyle('#3b82f6', '#fff')}>
              {sending ? 'Sending…' : 'Send'}
            </button>
            <button onClick={() => void abortSession()} style={buttonStyle('#374151', '#fff')}>Abort</button>
          </div>
        </div>
      </div>
    </>
  )
}
