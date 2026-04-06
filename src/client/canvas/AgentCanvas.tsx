import { useEffect, useMemo, useRef } from 'react'
import {
  type Node,
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

const nodeTypes: NodeTypes = {
  agentNode: AgentNode as NodeTypes[string],
  groupHeader: GroupHeaderNode as NodeTypes[string],
}
const edgeTypes: EdgeTypes = { agentEdge: AgentEdge as EdgeTypes[string] }

export function AgentCanvas() {
  const {
    viewMode,
    nodes,
    edges,
    groupHeaders,
    compat,
    applySessionTree,
    applyEvent,
    setSelectedSession,
    setViewMode,
    onNodesChange,
    pinNode,
  } = useAgentStore()
  const hasFramedInitialView = useRef(false)
  const previousViewMode = useRef(viewMode)
  const reactFlowRef = useRef<ReactFlowInstance<Node> | null>(null)

  async function reloadTree() {
    const response = await fetch('/api/tree')
    const data = await response.json()
    applySessionTree(data)
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
    const es = new EventSource('/api/events')
    es.onmessage = (e) => {
      try { applyEvent(JSON.parse(e.data)) } catch {}
    }
    es.onerror = () => console.warn('[sse] connection issue')
    return () => es.close()
  }, [applyEvent])

  useEffect(() => {
    if (nodes.length === 0 || !reactFlowRef.current) return

    const shouldFrame = !hasFramedInitialView.current || previousViewMode.current !== viewMode
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
  }, [nodes, viewMode])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 16,
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
              fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim() || undefined }),
              })
                .then((response) => response.json())
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
    </div>
  )
}
