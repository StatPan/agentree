import { useState } from 'react'

type FileDiff = {
  file: string
  before: string
  after: string
  additions: number
  deletions: number
  status?: 'added' | 'deleted' | 'modified'
}

export function DiffView({ sessionId }: { sessionId: string }) {
  const [diffs, setDiffs] = useState<FileDiff[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function loadDiffs() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/session/${sessionId}/diff`)
      if (!res.ok) throw new Error('Failed to load diffs')
      const data = await res.json()
      setDiffs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  function toggleFile(file: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }

  if (diffs === null) {
    return (
      <div style={{ padding: '8px 16px' }}>
        <button
          onClick={() => void loadDiffs()}
          disabled={loading}
          style={{
            background: 'none', border: '1px solid #374151', borderRadius: 4,
            color: '#9ca3af', fontSize: 10, cursor: loading ? 'default' : 'pointer', padding: '3px 8px',
          }}
        >
          {loading ? 'Loading...' : 'View Diffs'}
        </button>
        {error && <span style={{ color: '#ef4444', fontSize: 10, marginLeft: 8 }}>{error}</span>}
      </div>
    )
  }

  if (diffs.length === 0) {
    return (
      <div style={{ padding: '8px 16px', fontSize: 11, color: '#4b5563' }}>
        No file changes.
        <button onClick={() => setDiffs(null)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 10, cursor: 'pointer', marginLeft: 6 }}>
          ✕
        </button>
      </div>
    )
  }

  const statusColor = (s?: string) => s === 'added' ? '#22c55e' : s === 'deleted' ? '#ef4444' : '#eab308'

  return (
    <div style={{ borderBottom: '1px solid #1f2937' }}>
      <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Diffs ({diffs.length} file{diffs.length !== 1 ? 's' : ''})
        </span>
        <button onClick={() => setDiffs(null)} style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 12, cursor: 'pointer', padding: '0 3px', marginLeft: 'auto' }}>
          ✕
        </button>
      </div>
      {diffs.map((d) => (
        <div key={d.file}>
          <button
            onClick={() => toggleFile(d.file)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '4px 16px',
              background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ color: '#6b7280', fontSize: 10, flexShrink: 0 }}>{expanded.has(d.file) ? '▾' : '▸'}</span>
            <span style={{ color: '#e5e7eb', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {d.file}
            </span>
            {d.status && (
              <span style={{ color: statusColor(d.status), fontSize: 9, fontFamily: 'monospace', flexShrink: 0 }}>
                {d.status}
              </span>
            )}
            <span style={{ fontSize: 10, fontFamily: 'monospace', flexShrink: 0 }}>
              {d.additions > 0 && <span style={{ color: '#22c55e' }}>+{d.additions}</span>}
              {d.additions > 0 && d.deletions > 0 && <span style={{ color: '#4b5563' }}> </span>}
              {d.deletions > 0 && <span style={{ color: '#ef4444' }}>-{d.deletions}</span>}
            </span>
          </button>
          {expanded.has(d.file) && (
            <div style={{
              margin: '0 16px 8px', padding: 8, background: '#0b0b0b', borderRadius: 4,
              fontSize: 10, fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowX: 'auto',
              maxHeight: 300, overflowY: 'auto', color: '#9ca3af', lineHeight: 1.6,
            }}>
              {renderUnifiedDiff(d.before, d.after)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function renderUnifiedDiff(before: string, after: string): React.ReactNode {
  if (!before && !after) return <span style={{ color: '#4b5563' }}>(empty)</span>

  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const lines: React.ReactNode[] = []

  // Simple line-by-line diff (not a full diff algorithm — shows before/after blocks)
  const maxLen = Math.max(beforeLines.length, afterLines.length)
  let i = 0
  let j = 0

  outer: while (i < beforeLines.length || j < afterLines.length) {
    if (i < beforeLines.length && j < afterLines.length && beforeLines[i] === afterLines[j]) {
      lines.push(<div key={`c-${i}`} style={{ color: '#6b7280' }}>{' '}{beforeLines[i]}</div>)
      i++
      j++
    } else {
      const prevI = i
      const prevJ = j
      // Show removed lines
      while (i < beforeLines.length && (j >= afterLines.length || beforeLines[i] !== afterLines[j])) {
        lines.push(<div key={`d-${i}`} style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>-{beforeLines[i]}</div>)
        i++
        if (lines.length > maxLen * 2) break
      }
      // Show added lines
      while (j < afterLines.length && (i >= beforeLines.length || afterLines[j] !== beforeLines[i])) {
        lines.push(<div key={`a-${j}`} style={{ color: '#22c55e', background: 'rgba(34,197,94,0.08)' }}>+{afterLines[j]}</div>)
        j++
        if (lines.length > maxLen * 2) break
      }
      // Safety: if neither pointer advanced, force progress to prevent infinite loop
      if (i === prevI && j === prevJ) {
        if (i < beforeLines.length) { lines.push(<div key={`d-${i}`} style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>-{beforeLines[i]}</div>); i++ }
        if (j < afterLines.length) { lines.push(<div key={`a-${j}`} style={{ color: '#22c55e', background: 'rgba(34,197,94,0.08)' }}>+{afterLines[j]}</div>); j++ }
      }
    }
    if (lines.length > 500) {
      lines.push(<div key="truncated" style={{ color: '#4b5563' }}>... (truncated)</div>)
      break outer
    }
  }

  return <>{lines}</>
}
