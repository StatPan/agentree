import { useMemo, useState } from 'react'
import { useAgentStore } from '../store/agentStore'
import { smallBtn } from './SessionPanel'

type PeerPendingItem = {
  peerId: string
  peerLabel: string
  type: 'permission' | 'question'
  payload: unknown
}

type PeerContext = {
  loading: boolean
  summary: string | null
  messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>
}

export function PeerReviewSection({ sessionId }: { sessionId: string }) {
  const relations = useAgentStore((s) => s.relations)
  const pendingPermissions = useAgentStore((s) => s.pendingPermissions)
  const pendingQuestions = useAgentStore((s) => s.pendingQuestions)
  const nodes = useAgentStore((s) => s.nodes)
  const sessions = useAgentStore((s) => s.sessions)
  const setSelectedSession = useAgentStore((s) => s.setSelectedSession)

  const [contextByPeer, setContextByPeer] = useState<Record<string, PeerContext>>({})
  const [expandedContext, setExpandedContext] = useState<Set<string>>(new Set())
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({})

  const peerPendingItems = useMemo((): PeerPendingItem[] => {
    const linkedPeerIds = relations
      .filter((r) => r.relation_type === 'linked')
      .flatMap((r) => [
        r.from_session_id === sessionId ? r.to_session_id : null,
        r.to_session_id === sessionId ? r.from_session_id : null,
      ])
      .filter((id): id is string => id !== null)

    const uniquePeerIds = [...new Set(linkedPeerIds)]
    const items: PeerPendingItem[] = []
    for (const peerId of uniquePeerIds) {
      const peerLabel =
        (nodes.find((n) => n.id === peerId)?.data.label as string | undefined) ??
        sessions.find((s) => s.id === peerId)?.title ??
        peerId.slice(0, 8)
      if (pendingPermissions[peerId]) {
        items.push({ peerId, peerLabel, type: 'permission', payload: pendingPermissions[peerId] })
      }
      if (pendingQuestions[peerId]) {
        items.push({ peerId, peerLabel, type: 'question', payload: pendingQuestions[peerId] })
      }
    }
    return items
  }, [relations, sessionId, pendingPermissions, pendingQuestions, nodes, sessions])

  if (peerPendingItems.length === 0) return null

  async function loadContext(peerId: string) {
    setContextByPeer((prev) => ({ ...prev, [peerId]: { loading: true, summary: null, messages: [] } }))
    const [messagesRes, summaryRes] = await Promise.allSettled([
      fetch(`/api/session/${peerId}/messages?limit=10`).then((r) => { if (!r.ok) throw new Error('Failed'); return r.json() }),
      fetch(`/api/session/${peerId}/summarize`, { method: 'POST' }).then((r) => { if (!r.ok) throw new Error('Failed'); return r.json() }),
    ])
    const messages = messagesRes.status === 'fulfilled' && Array.isArray(messagesRes.value) ? messagesRes.value : []
    const summaryOk = summaryRes.status === 'fulfilled' && summaryRes.value?.ok
    // After summarize, the summary appears in the latest messages — find it
    let summary: string | null = null
    if (summaryOk && messages.length > 0) {
      const last = messages[messages.length - 1]
      const isMsg = (x: unknown): x is { role: string; parts: Array<{ type: string; text?: string }> } =>
        typeof x === 'object' && x !== null && 'role' in x && 'parts' in x && Array.isArray((x as { parts: unknown }).parts)
      if (isMsg(last) && last.role === 'assistant') {
        const textPart = last.parts.find((p) => p.type === 'text')
        if (textPart?.text) summary = textPart.text
      }
    }
    setContextByPeer((prev) => ({ ...prev, [peerId]: { loading: false, summary, messages } }))
  }

  function toggleContext(peerId: string) {
    setExpandedContext((prev) => {
      const next = new Set(prev)
      if (next.has(peerId)) {
        next.delete(peerId)
      } else {
        next.add(peerId)
        if (!contextByPeer[peerId]) void loadContext(peerId)
      }
      return next
    })
  }

  async function replyPermission(peerId: string, reply: 'once' | 'always' | 'reject') {
    const p = pendingPermissions[peerId] as { requestID?: string; id?: string } | undefined
    const requestID = p?.requestID ?? p?.id
    if (!requestID) return
    try {
      const res = await fetch(`/api/permission/${requestID}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply }),
      })
      if (!res.ok) throw new Error('Failed to reply to permission')
    } catch (err) {
      console.error('[PeerReview] permission reply failed:', err)
    }
  }

  async function submitQuestion(peerId: string) {
    const payload = pendingQuestions[peerId] as {
      requestID?: string; id?: string
      questions?: Array<{ id?: string; question?: string }>
    } | undefined
    const requestID = payload?.requestID ?? payload?.id
    const firstQ = payload?.questions?.[0]
    const answer = questionAnswers[peerId]?.trim()
    if (!requestID || !firstQ?.id || !answer) return
    try {
      const res = await fetch(`/api/question/${requestID}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: [{ questionID: firstQ.id, value: answer }] }),
      })
      if (!res.ok) throw new Error('Failed to submit answer')
      setQuestionAnswers((prev) => { const next = { ...prev }; delete next[peerId]; return next })
    } catch (err) {
      console.error('[PeerReview] question reply failed:', err)
    }
  }

  async function rejectQuestion(peerId: string) {
    const payload = pendingQuestions[peerId] as { requestID?: string; id?: string } | undefined
    const requestID = payload?.requestID ?? payload?.id
    if (!requestID) return
    try {
      const res = await fetch(`/api/question/${requestID}/reject`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to reject question')
    } catch (err) {
      console.error('[PeerReview] question reject failed:', err)
    }
  }

  return (
    <div style={{ borderBottom: '1px solid #1f2937' }}>
      <div style={{ padding: '10px 16px 6px', color: '#818cf8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Peer Review ({peerPendingItems.length})
      </div>
      {peerPendingItems.map((item) =>
        item.type === 'permission' ? (
          <PeerPermissionRow
            key={`p-${item.peerId}`}
            item={item}
            onReply={replyPermission}
            onFocus={setSelectedSession}
            contextExpanded={expandedContext.has(item.peerId)}
            onToggleContext={() => toggleContext(item.peerId)}
            context={contextByPeer[item.peerId] ?? null}
          />
        ) : (
          <PeerQuestionRow
            key={`q-${item.peerId}`}
            item={item}
            answer={questionAnswers[item.peerId] ?? ''}
            setAnswer={(v) => setQuestionAnswers((prev) => ({ ...prev, [item.peerId]: v }))}
            onSubmit={submitQuestion}
            onReject={rejectQuestion}
            onFocus={setSelectedSession}
            contextExpanded={expandedContext.has(item.peerId)}
            onToggleContext={() => toggleContext(item.peerId)}
            context={contextByPeer[item.peerId] ?? null}
          />
        ),
      )}
    </div>
  )
}

// ─── Row components ──────────────────────────────────────────────────────────

function PeerPermissionRow({
  item, onReply, onFocus, contextExpanded, onToggleContext, context,
}: {
  item: PeerPendingItem
  onReply: (peerId: string, reply: 'once' | 'always' | 'reject') => void
  onFocus: (id: string) => void
  contextExpanded: boolean
  onToggleContext: () => void
  context: PeerContext | null
}) {
  const p = item.payload as { title?: string; command?: string; description?: string }
  const desc = p.title ?? p.command ?? p.description ?? 'Permission requested'
  return (
    <div style={{ padding: '8px 16px', borderTop: '1px solid #1f2937', background: '#0d1117' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <button
          onClick={() => onFocus(item.peerId)}
          style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          {item.peerLabel}
        </button>
        <span style={{ background: '#312e81', color: '#a5b4fc', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
          PEER
        </span>
      </div>
      <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {desc}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={() => onReply(item.peerId, 'once')} style={smallBtn('#eab308', '#111')}>Once</button>
        <button onClick={() => onReply(item.peerId, 'always')} style={smallBtn('#22c55e', '#111')}>Always</button>
        <button onClick={() => onReply(item.peerId, 'reject')} style={smallBtn('#374151', '#e5e7eb')}>Deny</button>
        <button
          onClick={onToggleContext}
          style={{ ...smallBtn('#1e1b4b', '#818cf8'), marginLeft: 'auto' }}
        >
          Context {contextExpanded ? '▾' : '▸'}
        </button>
      </div>
      {contextExpanded && <ContextPanel context={context} />}
    </div>
  )
}

function PeerQuestionRow({
  item, answer, setAnswer, onSubmit, onReject, onFocus, contextExpanded, onToggleContext, context,
}: {
  item: PeerPendingItem
  answer: string
  setAnswer: (v: string) => void
  onSubmit: (peerId: string) => void
  onReject: (peerId: string) => void
  onFocus: (id: string) => void
  contextExpanded: boolean
  onToggleContext: () => void
  context: PeerContext | null
}) {
  const q = item.payload as { questions?: Array<{ question?: string; label?: string }> }
  const firstQ = q.questions?.[0]
  const questionText = firstQ?.question ?? firstQ?.label ?? 'Question asked'
  return (
    <div style={{ padding: '8px 16px', borderTop: '1px solid #1f2937', background: '#0d1117' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <button
          onClick={() => onFocus(item.peerId)}
          style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          {item.peerLabel}
        </button>
        <span style={{ background: '#312e81', color: '#a5b4fc', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
          PEER
        </span>
      </div>
      <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>{questionText}</div>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={2}
        placeholder="Type answer..."
        style={{
          width: '100%', background: '#111827', color: '#e5e7eb', border: '1px solid #27272a',
          borderRadius: 6, padding: '5px 7px', fontSize: 11, resize: 'none',
          fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box', marginBottom: 6,
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(item.peerId) }
        }}
      />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={() => onSubmit(item.peerId)} style={smallBtn('#f97316', '#111')}>Submit</button>
        <button onClick={() => onReject(item.peerId)} style={smallBtn('#374151', '#e5e7eb')}>Reject</button>
        <button
          onClick={onToggleContext}
          style={{ ...smallBtn('#1e1b4b', '#818cf8'), marginLeft: 'auto' }}
        >
          Context {contextExpanded ? '▾' : '▸'}
        </button>
      </div>
      {contextExpanded && <ContextPanel context={context} />}
    </div>
  )
}

// ─── Context panel ───────────────────────────────────────────────────────────

function ContextPanel({ context }: { context: PeerContext | null }) {
  if (!context || context.loading) {
    return (
      <div style={{ padding: '8px 0', color: '#6b7280', fontSize: 10 }}>
        Loading context...
      </div>
    )
  }

  return (
    <div style={{ marginTop: 8, padding: 8, background: '#0b0b0b', borderRadius: 6, border: '1px solid #1f2937' }}>
      {context.summary && (
        <div style={{ color: '#a5b4fc', fontSize: 10, fontStyle: 'italic', marginBottom: 8, lineHeight: 1.5, borderBottom: '1px solid #1f2937', paddingBottom: 6 }}>
          {context.summary}
        </div>
      )}
      {context.messages.length > 0 ? (
        <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {context.messages.map((msg, i) => {
            const role = (msg as { role?: string }).role ?? 'unknown'
            const parts = msg.parts ?? []
            const text = parts
              .filter((p) => p.type === 'text' && p.text)
              .map((p) => p.text)
              .join(' ')
            const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text
            if (!truncated) return null
            return (
              <div key={i} style={{ fontSize: 10, lineHeight: 1.4 }}>
                <span style={{ color: role === 'assistant' ? '#818cf8' : '#6ee7b7', fontWeight: 600, marginRight: 4 }}>
                  {role === 'assistant' ? 'AI' : 'User'}:
                </span>
                <span style={{ color: '#9ca3af' }}>{truncated}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ color: '#4b5563', fontSize: 10 }}>No recent messages.</div>
      )}
    </div>
  )
}
