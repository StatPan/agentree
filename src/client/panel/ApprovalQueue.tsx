import { useState } from 'react'
import { useAgentStore } from '../store/agentStore'

type PermissionPayload = {
  requestID?: string
  id?: string
  title?: string
  command?: string
  description?: string
}

type QuestionPayload = {
  requestID?: string
  id?: string
  questions?: Array<{ id?: string; question?: string; label?: string }>
}

function getRequestID(payload: unknown): string | undefined {
  const p = payload as PermissionPayload
  return p.requestID ?? p.id
}

function btn(bg: string, color: string, small = false) {
  return {
    appearance: 'none' as const,
    border: 'none',
    borderRadius: 6,
    padding: small ? '4px 8px' : '5px 10px',
    background: bg,
    color,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  }
}

export function ApprovalQueue() {
  const pendingPermissions = useAgentStore((s) => s.pendingPermissions)
  const pendingQuestions = useAgentStore((s) => s.pendingQuestions)
  const nodes = useAgentStore((s) => s.nodes)
  const sessions = useAgentStore((s) => s.sessions)
  const setSelectedSession = useAgentStore((s) => s.setSelectedSession)

  const [collapsed, setCollapsed] = useState(false)
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({})

  const permEntries = Object.entries(pendingPermissions) as [string, unknown][]
  const qEntries = Object.entries(pendingQuestions) as [string, unknown][]
  const total = permEntries.length + qEntries.length

  if (total === 0) return null

  function labelFor(sessionId: string) {
    return nodes.find((n) => n.id === sessionId)?.data.label as string | undefined ?? sessionId.slice(0, 8)
  }

  function supervisorLabelFor(childSessionId: string): string | undefined {
    const session = sessions.find((s) => s.id === childSessionId)
    if (!session?.parentID) return undefined
    return nodes.find((n) => n.id === session.parentID)?.data.label as string | undefined ?? session.parentID.slice(0, 8)
  }

  async function replyPermission(sessionId: string, reply: 'once' | 'always' | 'reject') {
    const requestID = getRequestID(pendingPermissions[sessionId])
    if (!requestID) return
    await fetch(`/api/permission/${requestID}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    })
  }

  async function submitQuestion(sessionId: string) {
    const payload = pendingQuestions[sessionId] as QuestionPayload
    const requestID = getRequestID(payload)
    const firstQuestion = payload.questions?.[0]
    const answer = questionAnswers[sessionId]?.trim()
    if (!requestID || !firstQuestion?.id || !answer) return
    await fetch(`/api/question/${requestID}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: [{ questionID: firstQuestion.id, value: answer }] }),
    })
    setQuestionAnswers((prev) => { const next = { ...prev }; delete next[sessionId]; return next })
  }

  async function rejectQuestion(sessionId: string) {
    const requestID = getRequestID(pendingQuestions[sessionId])
    if (!requestID) return
    await fetch(`/api/question/${requestID}/reject`, { method: 'POST' })
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1000,
        width: collapsed ? 'auto' : 320,
        background: '#0f172a',
        border: '1px solid #1e3a5f',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#f1f5f9',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              background: '#eab308',
              color: '#111',
              borderRadius: '50%',
              width: 20,
              height: 20,
              fontSize: 11,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {total}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {collapsed ? 'Pending approvals' : 'Pending approvals'}
          </span>
        </div>
        <span style={{ color: '#64748b', fontSize: 12 }}>{collapsed ? '▲' : '▼'}</span>
      </button>

      {!collapsed && (
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {/* Permissions */}
          {permEntries.map(([sessionId, payload]) => {
            const p = payload as PermissionPayload
            const desc = p.title ?? p.command ?? p.description ?? 'Permission requested'
            return (
              <div
                key={`perm-${sessionId}`}
                style={{
                  padding: '10px 14px',
                  borderTop: '1px solid #1e293b',
                  background: '#0a0f1a',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: supervisorLabelFor(sessionId) ? 2 : 6 }}>
                  <button
                    onClick={() => setSelectedSession(sessionId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#38bdf8',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {labelFor(sessionId)}
                  </button>
                  <span
                    style={{
                      background: '#7c3f00',
                      color: '#fde68a',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    PERMISSION
                  </span>
                </div>
                {supervisorLabelFor(sessionId) && (
                  <div style={{ color: '#475569', fontSize: 10, fontStyle: 'italic', marginBottom: 6 }}>
                    via {supervisorLabelFor(sessionId)}
                  </div>
                )}
                <div
                  style={{
                    color: '#cbd5e1',
                    fontSize: 12,
                    marginBottom: 8,
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {desc}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => void replyPermission(sessionId, 'once')} style={btn('#eab308', '#111')}>Once</button>
                  <button onClick={() => void replyPermission(sessionId, 'always')} style={btn('#22c55e', '#111')}>Always</button>
                  <button onClick={() => void replyPermission(sessionId, 'reject')} style={btn('#374151', '#e5e7eb')}>Deny</button>
                </div>
              </div>
            )
          })}

          {/* Questions */}
          {qEntries.map(([sessionId, payload]) => {
            const q = payload as QuestionPayload
            const firstQ = q.questions?.[0]
            const questionText = firstQ?.question ?? firstQ?.label ?? 'Question asked'
            const answer = questionAnswers[sessionId] ?? ''
            return (
              <div
                key={`q-${sessionId}`}
                style={{
                  padding: '10px 14px',
                  borderTop: '1px solid #1e293b',
                  background: '#0a0f1a',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: supervisorLabelFor(sessionId) ? 2 : 6 }}>
                  <button
                    onClick={() => setSelectedSession(sessionId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#38bdf8',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {labelFor(sessionId)}
                  </button>
                  <span
                    style={{
                      background: '#7c2d00',
                      color: '#fed7aa',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    QUESTION
                  </span>
                </div>
                {supervisorLabelFor(sessionId) && (
                  <div style={{ color: '#475569', fontSize: 10, fontStyle: 'italic', marginBottom: 6 }}>
                    via {supervisorLabelFor(sessionId)}
                  </div>
                )}
                <div style={{ color: '#cbd5e1', fontSize: 12, marginBottom: 8, lineHeight: 1.4 }}>
                  {questionText}
                </div>
                <textarea
                  value={answer}
                  onChange={(e) => setQuestionAnswers((prev) => ({ ...prev, [sessionId]: e.target.value }))}
                  rows={2}
                  placeholder="Type answer…"
                  style={{
                    width: '100%',
                    background: '#111827',
                    color: '#e5e7eb',
                    border: '1px solid #27272a',
                    borderRadius: 6,
                    padding: '6px 8px',
                    fontSize: 11,
                    resize: 'none',
                    fontFamily: 'ui-monospace, monospace',
                    boxSizing: 'border-box',
                    marginBottom: 6,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void submitQuestion(sessionId)
                    }
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => void submitQuestion(sessionId)} style={btn('#f97316', '#111')}>Submit</button>
                  <button onClick={() => void rejectQuestion(sessionId)} style={btn('#374151', '#e5e7eb')}>Reject</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
