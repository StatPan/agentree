import { useEffect, useMemo, useState } from 'react'

type SubtaskDialogProps = {
  sessionId: string
  onClose: () => void
  onCreated?: () => void
}

type AgentInfo = {
  name: string
  description?: string
  mode: 'subagent' | 'primary' | 'all'
  hidden?: boolean
  native?: boolean
}

const fieldStyle = {
  width: '100%',
  background: '#0b0b0b',
  color: '#e5e7eb',
  border: '1px solid #27272a',
  borderRadius: 8,
  padding: 10,
  fontSize: 12,
  boxSizing: 'border-box' as const,
}

export function SubtaskDialog({ sessionId, onClose, onCreated }: SubtaskDialogProps) {
  const [prompt, setPrompt] = useState('')
  const [description, setDescription] = useState('')
  const [agent, setAgent] = useState('build')
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/agents')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return
        setAgents(data)
        const preferred = data.find((item: AgentInfo) => !item.hidden && item.mode === 'subagent')
          ?? data.find((item: AgentInfo) => !item.hidden && item.mode === 'all')
          ?? data.find((item: AgentInfo) => item.name === 'build')
        if (preferred?.name) setAgent(preferred.name)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const sortedAgents = useMemo(() => [...agents].sort((left, right) => {
    const rank = (agentInfo: AgentInfo) => agentInfo.mode === 'subagent' ? 0 : agentInfo.mode === 'all' ? 1 : 2
    return rank(left) - rank(right) || left.name.localeCompare(right.name)
  }), [agents])

  async function submit() {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/session/${sessionId}/subtask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          description: description.trim() || undefined,
          agent: agent.trim() || undefined,
        }),
      })

      if (!response.ok) throw new Error('Failed to spawn subtask')
      onCreated?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 520,
          maxWidth: 'calc(100vw - 32px)',
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
          padding: 18,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ color: '#f3f4f6', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Spawn Subtask</div>
        <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14, fontFamily: 'ui-monospace, monospace' }}>{sessionId}</div>
        {error && <div style={{ color: '#fca5a5', fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'grid', gap: 10 }}>
          {sortedAgents.length > 0 ? (
            <select value={agent} onChange={(e) => setAgent(e.target.value)} style={fieldStyle}>
              {sortedAgents.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} · {item.mode}{item.hidden ? ' · hidden' : ''}
                </option>
              ))}
            </select>
          ) : (
            <input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="Agent name" style={fieldStyle} />
          )}
          {sortedAgents.find((item) => item.name === agent)?.description && (
            <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.4 }}>
              {sortedAgents.find((item) => item.name === agent)?.description}
            </div>
          )}
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" style={fieldStyle} />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
            placeholder="Describe the subtask to delegate"
            style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'ui-monospace, monospace' }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ border: 'none', borderRadius: 8, padding: '8px 12px', background: '#374151', color: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => void submit()} style={{ border: 'none', borderRadius: 8, padding: '8px 12px', background: '#3b82f6', color: '#fff', cursor: 'pointer' }}>
            {submitting ? 'Creating…' : 'Spawn'}
          </button>
        </div>
      </div>
    </div>
  )
}
