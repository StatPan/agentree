import { useMemo, useState } from 'react'
import { useAgentStore, STATUS_COLORS } from '../store/agentStore'

export function SessionListSidebar() {
  const sessions = useAgentStore((s) => s.sessions)
  const nodes = useAgentStore((s) => s.nodes)
  const projects = useAgentStore((s) => s.projects)
  const statusBySession = useAgentStore((s) => s.statusBySession)
  const selectedSessionId = useAgentStore((s) => s.selectedSessionId)
  const setSelectedSession = useAgentStore((s) => s.setSelectedSession)
  const setActiveProjectKey = useAgentStore((s) => s.setActiveProjectKey)
  const setPendingScrollToSessionId = useAgentStore((s) => s.setPendingScrollToSessionId)

  const [collapsed, setCollapsed] = useState(true)
  const [search, setSearch] = useState('')

  const visibleNodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes])

  const filteredSessions = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return sessions
    return sessions.filter((s) =>
      (s.title ?? s.id).toLowerCase().includes(q) ||
      s.directory.toLowerCase().includes(q),
    )
  }, [sessions, search])

  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, typeof sessions>()
    for (const s of filteredSessions) {
      const k = s.projectId ?? 'unknown'
      const arr = map.get(k) ?? []
      arr.push(s)
      map.set(k, arr)
    }
    return [...map.entries()]
      .sort(([a], [b]) => (projectNameById.get(a) ?? a).localeCompare(projectNameById.get(b) ?? b))
      .map(([key, items]) => ({
        key,
        label: projectNameById.get(key) ?? key,
        sessions: [...items].sort((a, b) => b.time.updated - a.time.updated),
      }))
  }, [filteredSessions, projectNameById])

  function handleClick(sessionId: string) {
    setSelectedSession(sessionId)
    if (!visibleNodeIds.has(sessionId)) {
      setActiveProjectKey(null)
    }
    setPendingScrollToSessionId(sessionId)
  }

  if (collapsed) {
    return (
      <div
        style={{
          width: 24,
          height: '100%',
          background: '#0f172a',
          borderRight: '1px solid #1f2937',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
        }}
        onClick={() => setCollapsed(false)}
        title="Open session list"
      >
        <span style={{ color: '#4b5563', fontSize: 10, writingMode: 'vertical-rl', letterSpacing: '0.08em', userSelect: 'none' }}>
          ▶
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        width: 220,
        height: '100%',
        background: '#0f172a',
        borderRight: '1px solid #1f2937',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 10px 8px',
        borderBottom: '1px solid #1f2937',
        flexShrink: 0,
      }}>
        <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Sessions
        </span>
        <button
          onClick={() => setCollapsed(true)}
          style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }}
          title="Collapse"
        >
          ◀
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 8px 6px', flexShrink: 0 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          style={{
            width: '100%',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#e2e8f0',
            fontSize: 11,
            padding: '5px 8px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>
        {grouped.map(({ key, label, sessions: groupSessions }) => (
          <div key={key}>
            <div style={{
              padding: '6px 10px 3px',
              fontSize: 10,
              fontWeight: 700,
              color: '#475569',
              letterSpacing: '0.04em',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              userSelect: 'none',
            }}>
              {label} <span style={{ color: '#334155' }}>({groupSessions.length})</span>
            </div>
            {groupSessions.map((session) => {
              const status = statusBySession[session.id] ?? 'idle'
              const isVisible = visibleNodeIds.has(session.id)
              const isSelected = session.id === selectedSessionId
              return (
                <div
                  key={session.id}
                  onClick={() => handleClick(session.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '5px 10px',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(56,189,248,0.12)' : isVisible ? 'rgba(56,189,248,0.05)' : 'transparent',
                    borderLeft: isSelected ? '2px solid #38bdf8' : '2px solid transparent',
                  }}
                >
                  <div style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: STATUS_COLORS[status] ?? '#6b7280',
                    flexShrink: 0,
                  }} />
                  <span style={{
                    color: isSelected ? '#e2e8f0' : isVisible ? '#cbd5e1' : '#64748b',
                    fontSize: 11,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: isSelected ? 600 : 400,
                  }}>
                    {session.title ?? session.id.slice(0, 8)}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
        {grouped.length === 0 && (
          <div style={{ color: '#4b5563', fontSize: 11, padding: '12px 10px', textAlign: 'center' }}>
            No sessions found
          </div>
        )}
      </div>
    </div>
  )
}
