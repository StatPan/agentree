import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchJson } from '../utils/fetchJson'
import {
  type Node,
  type Connection,
  type ReactFlowInstance,
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useAgentStore } from '../store/agentStore'
import { AgentNode } from './AgentNode'
import { AgentEdge } from './AgentEdge'
import { GroupHeaderNode } from './GroupHeaderNode'
import { ProjectTabBar } from './ProjectTabBar'

type ConnRelationType = 'linked' | 'detached'

const RELATION_COLORS: Record<ConnRelationType, string> = {
  linked: '#818cf8',
  detached: '#6b7280',
}

function ConnectDialog({
  source,
  target,
  onConfirm,
  onCancel,
}: {
  source: string
  target: string
  onConfirm: (type: ConnRelationType) => Promise<void>
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<ConnRelationType>('linked')
  const [connecting, setConnecting] = useState(false)

  async function handleConfirm() {
    setConnecting(true)
    await onConfirm(selected)
    setConnecting(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: '#111',
          border: '1px solid #334155',
          borderRadius: 12,
          padding: '18px 22px',
          minWidth: 220,
          boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
          pointerEvents: 'all',
        }}
      >
        <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
          Connect as
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {(['linked', 'detached'] as const).map((type) => (
            <label
              key={type}
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: selected === type ? '#e5e7eb' : '#6b7280' }}
            >
              <input
                type="radio"
                name={`conn-${source}-${target}`}
                value={type}
                checked={selected === type}
                onChange={() => setSelected(type)}
                style={{ accentColor: RELATION_COLORS[type] }}
              />
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: RELATION_COLORS[type] }}>
                {type}
              </span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => void handleConfirm()}
            disabled={connecting}
            style={{
              flex: 1,
              background: connecting ? '#1f2937' : '#1d4ed8',
              color: connecting ? '#4b5563' : '#eff6ff',
              border: 'none',
              borderRadius: 8,
              padding: '7px 0',
              fontSize: 12,
              fontWeight: 700,
              cursor: connecting ? 'default' : 'pointer',
            }}
          >
            {connecting ? '…' : 'Connect'}
          </button>
          <button
            onClick={onCancel}
            disabled={connecting}
            style={{
              background: 'none',
              color: '#6b7280',
              border: '1px solid #374151',
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: 12,
              cursor: connecting ? 'default' : 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  agentNode: AgentNode as NodeTypes[string],
  groupHeader: GroupHeaderNode as NodeTypes[string],
}
const edgeTypes: EdgeTypes = { agentEdge: AgentEdge as EdgeTypes[string] }

export function AgentCanvas() {
  const viewMode = useAgentStore((s) => s.viewMode)
  const nodes = useAgentStore((s) => s.nodes)
  const edges = useAgentStore((s) => s.edges)
  const groupHeaders = useAgentStore((s) => s.groupHeaders)
  const compat = useAgentStore((s) => s.compat)
  const sessions = useAgentStore((s) => s.sessions)
  const projects = useAgentStore((s) => s.projects)
  const activeProjectKey = useAgentStore((s) => s.activeProjectKey)
  const pendingScrollToSessionId = useAgentStore((s) => s.pendingScrollToSessionId)
  const applySessionTree = useAgentStore((s) => s.applySessionTree)
  const applyEvent = useAgentStore((s) => s.applyEvent)
  const setSelectedSession = useAgentStore((s) => s.setSelectedSession)
  const setViewMode = useAgentStore((s) => s.setViewMode)
  const setActiveProjectKey = useAgentStore((s) => s.setActiveProjectKey)
  const setAppView = useAgentStore((s) => s.setAppView)
  const setPendingScrollToSessionId = useAgentStore((s) => s.setPendingScrollToSessionId)
  const onNodesChange = useAgentStore((s) => s.onNodesChange)
  const pinNode = useAgentStore((s) => s.pinNode)
  const addRelation = useAgentStore((s) => s.addRelation)
  const sseStatus = useAgentStore((s) => s.sseStatus)
  const setSseStatus = useAgentStore((s) => s.setSseStatus)
  const hasFramedInitialView = useRef(false)
  const [pendingConn, setPendingConn] = useState<{ source: string; target: string } | null>(null)
  const [treeError, setTreeError] = useState<string | null>(null)

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    if (connection.source === connection.target) return
    setPendingConn({ source: connection.source, target: connection.target })
  }, [])
  const previousViewMode = useRef(viewMode)
  const previousActiveKey = useRef(activeProjectKey)
  const hasTabBar = true // always show project header bar
  const reactFlowRef = useRef<ReactFlowInstance<Node> | null>(null)

  async function reloadTree() {
    try {
      const data = await fetchJson('/api/tree')
      applySessionTree(data)
      setTreeError(null)
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : 'Failed to load sessions')
    }
  }

  const displayNodes = useMemo<Node[]>(
    () => [
      ...groupHeaders.map((header) => ({
        id: header.id,
        type: 'groupHeader',
        position: { x: header.x, y: header.y },
        data: {
          label: header.label,
          rootCount: header.rootCount,
        },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
      })),
      ...nodes,
    ],
    [groupHeaders, nodes],
  )

  useEffect(() => {
    reloadTree().catch(console.error)
  }, [applySessionTree])

  useEffect(() => {
    let es: EventSource | null = null
    let cancelled = false
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let retryMs = 1000
    const MAX_RETRY_MS = 30_000
    let hasConnectedOnce = false

    function connect() {
      if (cancelled) return
      es = new EventSource('/api/events')
      es.onopen = () => {
        const shouldReloadTree = hasConnectedOnce
        hasConnectedOnce = true
        retryMs = 1000
        setSseStatus('connected')
        if (shouldReloadTree) {
          reloadTree().catch(console.error)
        }
      }
      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          applyEvent(event)
          if (event.type === 'session.created' || event.type === 'message.part.updated') {
            reloadTree().catch(console.error)
          }
        } catch (err) { console.warn('[sse] failed to parse event:', err) }
      }
      es.onerror = () => {
        es?.close()
        es = null
        if (!cancelled) {
          const delay = retryMs
          retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
          const status = delay >= MAX_RETRY_MS ? 'disconnected' : 'reconnecting'
          setSseStatus(status)
          console.warn(`[sse] connection lost, reconnecting in ${delay / 1000}s...`)
          retryTimeout = setTimeout(connect, delay)
        }
      }
    }

    connect()
    return () => {
      cancelled = true
      if (retryTimeout) clearTimeout(retryTimeout)
      es?.close()
    }
  }, [applyEvent])

  useEffect(() => {
    if (nodes.length === 0 || !reactFlowRef.current) return

    const shouldFrame = !hasFramedInitialView.current
      || previousViewMode.current !== viewMode
      || previousActiveKey.current !== activeProjectKey
    if (!shouldFrame) return

    reactFlowRef.current.fitView({
      nodes,
      padding: 0.2,
      minZoom: 0.35,
      maxZoom: 1.1,
      duration: 300,
    })
    hasFramedInitialView.current = true
    previousViewMode.current = viewMode
    previousActiveKey.current = activeProjectKey
  }, [nodes, viewMode, activeProjectKey])

  useEffect(() => {
    if (!pendingScrollToSessionId || !reactFlowRef.current) return
    const node = nodes.find((n) => n.id === pendingScrollToSessionId)
    if (!node) return
    reactFlowRef.current.setCenter(
      node.position.x + 100,
      node.position.y + 30,
      { zoom: 1.0, duration: 400 },
    )
    setPendingScrollToSessionId(null)
  }, [pendingScrollToSessionId, nodes])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ProjectTabBar
        projects={projects}
        activeProjectKey={activeProjectKey}
        totalSessionCount={sessions.length}
        onBack={() => setAppView('home')}
        onSelectAll={() => setActiveProjectKey(null)}
      />
      {nodes.length === 0 && sessions.length > 0 && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{ color: '#4b5563', fontSize: 13 }}>No sessions in this project</span>
        </div>
      )}
      {treeError && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: '#7f1d1d', color: '#fca5a5', padding: '8px 16px', borderRadius: 8,
          fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>Failed to load: {treeError}</span>
          <button onClick={() => void reloadTree()} style={{ background: 'none', border: '1px solid #fca5a5', color: '#fca5a5', borderRadius: 4, fontSize: 11, cursor: 'pointer', padding: '2px 8px' }}>
            Retry
          </button>
        </div>
      )}
      {sseStatus !== 'connected' && (
        <div style={{
          position: 'absolute', top: treeError ? 60 : 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: sseStatus === 'disconnected' ? '#1c1917' : '#1c1917',
          border: `1px solid ${sseStatus === 'disconnected' ? '#ef4444' : '#f59e0b'}`,
          color: sseStatus === 'disconnected' ? '#fca5a5' : '#fcd34d',
          padding: '6px 14px', borderRadius: 8,
          fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
          whiteSpace: 'nowrap',
        }}>
          <span
            style={{
              width: 7, height: 7, borderRadius: '50%',
              background: sseStatus === 'disconnected' ? '#ef4444' : '#f59e0b',
              flexShrink: 0,
            }}
          />
          {sseStatus === 'disconnected' ? 'Disconnected from server' : 'Reconnecting…'}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: hasTabBar ? 52 : 16,
          left: 16,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 8,
          borderRadius: 12,
          background: 'rgba(15, 23, 42, 0.86)',
          border: '1px solid #334155',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.24)',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => {
              const title = window.prompt('New session title (optional)') ?? ''
              fetchJson('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim() || undefined, projectId: activeProjectKey || undefined }),
              })
                .then((session) => {
                  if (session?.id) setSelectedSession(session.id)
                  return reloadTree()
                })
                .catch(console.error)
            }}
            style={{
              border: '1px solid #1d4ed8',
              background: '#1d4ed8',
              color: '#eff6ff',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            New Session
          </button>
          {(['recent', 'all'] as const).map((mode) => {
            const active = viewMode === mode
            return (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  border: `1px solid ${active ? '#38bdf8' : '#334155'}`,
                  background: active ? '#0f172a' : '#111827',
                  color: active ? '#e0f2fe' : '#cbd5e1',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {mode === 'recent' ? 'Recent' : 'All'}
              </button>
            )
          })}
        </div>
        <div style={{ width: 1, height: 20, background: '#334155' }} />
        <div style={{ color: '#94a3b8', fontSize: 12 }}>Grouped by directory</div>
        {compat && (
          <>
            <div style={{ width: 1, height: 20, background: '#334155' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 600 }}>{compat.profile}</span>
              <span style={{ color: '#64748b', fontSize: 11 }}>SDK {compat.sdkVersion}</span>
              <span style={{ color: compat.serverVersion ? '#64748b' : '#f59e0b', fontSize: 11 }}>
                Server {compat.serverVersion ?? 'unknown'}
              </span>
              {compat.warnings.length > 0 && (
                <span
                  title={compat.warnings.join('\n')}
                  style={{
                    maxWidth: 260,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: '#7c2d12',
                    color: '#fdba74',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {compat.warnings.length === 1 ? compat.warnings[0] : `${compat.warnings.length} compatibility warnings`}
                </span>
              )}
            </div>
          </>
        )}
      </div>
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(instance) => {
          reactFlowRef.current = instance
        }}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          if (node.type !== 'agentNode') return
          setSelectedSession(node.id)
        }}
        onNodeDragStop={(_, node: Node) => {
          if (node.type !== 'agentNode') return
          pinNode(node.id, node.position)
          fetch(`/api/canvas/${node.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: node.position.x, y: node.position.y, pinned: true }),
          }).catch(console.error)
        }}
        onPaneClick={() => setSelectedSession(null)}
        onConnect={onConnect}
        colorMode="dark"
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="#222" gap={24} size={1} />
        <Controls />
        <MiniMap
          style={{ background: '#111' }}
          nodeColor={(n) => {
            const s = (n.data as { status?: string }).status ?? 'idle'
            const c: Record<string, string> = {
              running: '#22c55e', 'needs-permission': '#eab308',
              'needs-answer': '#f97316', idle: '#3b82f6',
              done: '#6b7280', failed: '#ef4444',
            }
            return c[s] ?? '#6b7280'
          }}
        />
      </ReactFlow>
      {pendingConn && (
        <ConnectDialog
          source={pendingConn.source}
          target={pendingConn.target}
          onConfirm={async (type) => {
            await addRelation(pendingConn.source, pendingConn.target, type)
            setPendingConn(null)
          }}
          onCancel={() => setPendingConn(null)}
        />
      )}
    </div>
  )
}
