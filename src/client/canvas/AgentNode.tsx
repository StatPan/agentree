import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AgentNodeData } from '../store/agentStore'
import { useAgentStore, STATUS_COLORS } from '../store/agentStore'
import { fetchJson } from '../utils/fetchJson'

export function AgentNode({ data, selected }: NodeProps) {
  const d = data as AgentNodeData
  const color = STATUS_COLORS[d.status] ?? '#6b7280'
  const [showActivity, setShowActivity] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const isRunning = d.status === 'running'
  const setSelectedSession = useAgentStore((state) => state.setSelectedSession)
  const setSubtaskTargetSession = useAgentStore((state) => state.setSubtaskTargetSession)
  const applySessionTree = useAgentStore((state) => state.applySessionTree)

  async function refreshTree() {
    const tree = await fetchJson('/api/tree')
    applySessionTree(tree)
  }

  async function forkSession(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    // Lock canvas label before opencode renames original session
    await fetch(`/api/canvas/${d.sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: d.label }),
    })
    const forked = await fetchJson(`/api/session/${d.sessionId}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    await refreshTree()
    if (forked?.id) setSelectedSession(forked.id)
  }

  async function toggleDetach(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    await fetch(`/api/canvas/${d.sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detached: !d.detached }),
    })
    await refreshTree()
  }

  async function deleteSession(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (!window.confirm(`Delete "${d.label}"?`)) return
    await fetch(`/api/session/${d.sessionId}`, { method: 'DELETE' })
    await refreshTree()
    setSelectedSession(null)
  }

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `2px solid ${selected ? '#fff' : color}`,
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 160,
        maxWidth: 200,
        boxShadow: selected ? `0 0 0 2px ${color}44` : 'none',
        cursor: 'pointer',
        userSelect: 'none',
        position: 'relative',
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {showActions && (
        <div
          style={{
            position: 'absolute',
            top: -12,
            left: 12,
            display: 'flex',
            gap: 6,
            zIndex: 2,
          }}
        >
          <button
            onClick={(event) => {
              event.stopPropagation()
              setSelectedSession(d.sessionId)
              setSubtaskTargetSession(d.sessionId)
            }}
            style={{
              border: '1px solid #2563eb',
              background: '#1d4ed8',
              color: '#eff6ff',
              borderRadius: 999,
              padding: '2px 7px',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Subtask
          </button>
          <button
            onClick={(event) => { void forkSession(event) }}
            style={{ border: '1px solid #0f766e', background: '#115e59', color: '#ecfeff', borderRadius: 999, padding: '2px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
          >
            Fork
          </button>
          {d.hasParent && (
            <button
              onClick={(event) => { void toggleDetach(event) }}
              style={{
                border: d.detached ? '1px solid #0f766e' : '1px solid #7c3aed',
                background: d.detached ? '#115e59' : '#4c1d95',
                color: d.detached ? '#ecfeff' : '#ede9fe',
                borderRadius: 999, padding: '2px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {d.detached ? 'Reattach' : 'Detach'}
            </button>
          )}
          <button
            onClick={(event) => { void deleteSession(event) }}
            style={{ border: '1px solid #7f1d1d', background: '#450a0a', color: '#fca5a5', borderRadius: 999, padding: '2px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
          >
            Del
          </button>
        </div>
      )}
      {d.childPendingCount > 0 && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            background: '#eab308',
            color: '#111',
            borderRadius: '50%',
            width: 18,
            height: 18,
            fontSize: 10,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 0 2px #1a1a1a',
            zIndex: 1,
          }}
          title={`${d.childPendingCount} child session${d.childPendingCount > 1 ? 's' : ''} waiting`}
        >
          {d.childPendingCount}
        </div>
      )}
      {d.forkedFromSessionId && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            left: -8,
            background: '#14b8a6',
            color: '#042f2e',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.04em',
            boxShadow: '0 0 0 2px #1a1a1a',
            zIndex: 1,
          }}
          title={`Forked from ${d.forkedFromSessionId}`}
        >
          FORK
        </div>
      )}
      {d.taskCount > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: -8,
            right: -8,
            background: d.pendingTaskCount > 0 ? '#2563eb' : '#0f766e',
            color: '#eff6ff',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.04em',
            boxShadow: '0 0 0 2px #1a1a1a',
            zIndex: 1,
          }}
          title={`${d.taskCount} task${d.taskCount !== 1 ? 's' : ''}${d.pendingTaskCount > 0 ? `, ${d.pendingTaskCount} pending child` : ''}`}
        >
          TASK {d.taskCount}
        </div>
      )}
      {d.incomingTask && !d.forkedFromSessionId && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            left: -8,
            background: '#2563eb',
            color: '#eff6ff',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.04em',
            boxShadow: '0 0 0 2px #1a1a1a',
            zIndex: 1,
          }}
          title={`Spawned by ${d.incomingTask.agent}`}
        >
          TASK
        </div>
      )}
      <Handle type="target" position={Position.Bottom} style={{ background: '#555', border: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {d.label}
        </span>
      </div>

      {isRunning ? (
        <div
          style={{ paddingLeft: 16, marginTop: 3, cursor: 'default' }}
          onMouseEnter={() => setShowActivity(true)}
          onMouseLeave={() => setShowActivity(false)}
        >
          <span className="agentree-dots" style={{ color: '#22c55e', fontSize: 11 }}>
            <span>●</span><span>●</span><span>●</span>
          </span>
          {showActivity && d.lastActivity && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '100%',
                marginTop: 6,
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '7px 10px',
                fontSize: 11,
                color: '#94a3b8',
                width: 280,
                maxHeight: 110,
                overflow: 'hidden',
                zIndex: 9999,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.5,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
              }}
            >
              {d.lastActivity}
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2, paddingLeft: 16 }}>{d.status}</div>
      )}

      <Handle type="source" position={Position.Top} style={{ background: '#555', border: 'none' }} />
    </div>
  )
}
