import { applyNodeChanges, type Edge, type Node, type NodeChange } from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import { create } from 'zustand'

export type NodeStatus = 'running' | 'needs-permission' | 'needs-answer' | 'idle' | 'done' | 'failed'

export const STATUS_COLORS: Record<NodeStatus, string> = {
  running: '#22c55e',
  'needs-permission': '#eab308',
  'needs-answer': '#f97316',
  idle: '#60a5fa',
  done: '#6b7280',
  failed: '#ef4444',
}
export type ViewMode = 'recent' | 'all'
export type RelationType = 'fork' | 'linked' | 'detached'
export type AppView = 'home' | 'canvas'
export type SseStatus = 'connected' | 'reconnecting' | 'disconnected'
export type ActiveProjectKey = string | null

export type Project = {
  id: string
  name: string
  directoryKey: string | null
  userCreated: boolean
  createdAt: string
}

export type SessionRelation = {
  id: number
  from_session_id: string
  to_session_id: string
  relation_type: RelationType
  created_at: string
}

export type CompatInfo = {
  sdkVersion: string
  serverVersion: string | null
  profile: string
  warnings: string[]
}

export type AgentNodeData = {
  label: string
  status: NodeStatus
  sessionId: string
  directory: string
  forkedFromSessionId: string | null
  pinned: boolean
  updatedAt: number
  createdAt: number
  groupKey: string
  lastActivity: string
  childPendingCount: number
  hasParent: boolean
  detached: boolean
  taskCount: number
  pendingTaskCount: number
  incomingTask: TaskInvocation | undefined
  [key: string]: unknown
}

export type GroupHeader = {
  id: string
  key: string
  label: string
  x: number
  y: number
  rootCount: number
}

type SessionInfo = {
  id: string
  title: string
  parentID: string | null
  directory: string
  projectId?: string | null
  time: { created: number; updated: number }
  forkedFromSessionID?: string | null
  share?: { url: string } | null
  canvas?: {
    label?: string | null
    x?: number
    y?: number
    pinned?: boolean
    detached?: boolean
  } | null
}

export type TaskInvocation = {
  id: number
  parent_session_id: string
  message_id: string | null
  part_id: string | null
  child_session_id: string | null
  agent: string
  description: string
  prompt_preview: string
  created_at: string
  updated_at: string
}

type TreePayload = {
  sessions: SessionInfo[]
  statusBySession?: Record<string, NodeStatus>
  compat?: CompatInfo | null
  relations?: SessionRelation[]
  taskInvocations?: TaskInvocation[]
  projects?: Array<{ id: string; name: string; directory_key: string | null; user_created: number; created_at: string }>
}

type AgentEvent = {
  type: string
  properties: Record<string, unknown>
}

type MessageDelta = {
  type?: string
  text?: string
}

type LayoutResult = {
  nodes: Node<AgentNodeData>[]
  groupHeaders: GroupHeader[]
}

const NODE_WIDTH = 200
const NODE_HEIGHT = 60
const GROUP_GAP_X = 180
const GROUP_GAP_Y = 120
const GROUP_PADDING_X = 40
const GROUP_PADDING_Y = 60
const MAX_GROUP_COLUMN_HEIGHT = 960
const RECENT_ROOT_LIMIT = 8

function projectGroupFromDirectory(directory: string) {
  const marker = '/workspace/'
  const index = directory.indexOf(marker)
  const normalized = index >= 0 ? directory.slice(index + marker.length) : directory.replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return 'workspace'

  const bucketPrefixes = new Set(['apps', 'research', 'pypi_lib', 'libs', 'infra', 'skills', 'mcps', 'anal-repo'])
  if (parts.length >= 2 && bucketPrefixes.has(parts[0])) {
    return `${parts[0]}/${parts[1]}`
  }

  return parts[0]
}

function computeBounds(nodes: Node<AgentNodeData>[]) {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: NODE_WIDTH, maxY: NODE_HEIGHT, width: NODE_WIDTH, height: NODE_HEIGHT }
  }

  const minX = Math.min(...nodes.map((node) => node.position.x))
  const minY = Math.min(...nodes.map((node) => node.position.y))
  const maxX = Math.max(...nodes.map((node) => node.position.x + NODE_WIDTH))
  const maxY = Math.max(...nodes.map((node) => node.position.y + NODE_HEIGHT))

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function layoutSubtree(nodes: Node<AgentNodeData>[], edges: Edge[]) {
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: 'BT', ranksep: 80, nodesep: 40 })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target)
  }

  dagre.layout(graph)

  const laidOutNodes = nodes.map((node) => {
    if (node.data.pinned) return node
    const position = graph.node(node.id)
    if (!position) return node
    return {
      ...node,
      position: { x: position.x - NODE_WIDTH / 2, y: position.y - NODE_HEIGHT / 2 },
    }
  })

  const bounds = computeBounds(laidOutNodes.filter((node) => !node.data.pinned))
  return {
    nodes: laidOutNodes.map((node) =>
      node.data.pinned
        ? node
        : {
            ...node,
            position: {
              x: node.position.x - bounds.minX,
              y: node.position.y - bounds.minY,
            },
          },
    ),
    bounds,
  }
}

function collectSubtreeIds(rootId: string, childrenByParent: Map<string, string[]>) {
  const result: string[] = []
  const visited = new Set<string>()
  const queue = [rootId]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    result.push(current)
    const children = childrenByParent.get(current) ?? []
    for (const child of children) queue.push(child)
  }

  return result
}

function computeRecentVisibleIds(nodes: Node<AgentNodeData>[], edges: Edge[]) {
  const incoming = new Set(edges.map((edge) => edge.target))
  const childrenByParent = new Map<string, string[]>()

  for (const edge of edges) {
    const children = childrenByParent.get(edge.source) ?? []
    children.push(edge.target)
    childrenByParent.set(edge.source, children)
  }

  const roots = [...nodes]
    .filter((node) => !incoming.has(node.id))
    .sort((left, right) => right.data.updatedAt - left.data.updatedAt)

  const recentRootIds = roots.slice(0, RECENT_ROOT_LIMIT).map((node) => node.id)
  const visibleIds = new Set<string>()

  for (const rootId of recentRootIds) {
    for (const id of collectSubtreeIds(rootId, childrenByParent)) {
      visibleIds.add(id)
    }
  }

  if (visibleIds.size === 0 && nodes.length > 0) {
    visibleIds.add(nodes[0].id)
  }

  return visibleIds
}

function computeVisibleIds(nodes: Node<AgentNodeData>[], edges: Edge[], viewMode: ViewMode) {
  if (viewMode === 'all') return new Set(nodes.map((node) => node.id))
  return computeRecentVisibleIds(nodes, edges)
}

function computeLayout(nodes: Node<AgentNodeData>[], edges: Edge[]): LayoutResult {
  if (nodes.length === 0) {
    return { nodes, groupHeaders: [] }
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Set(edges.map((edge) => edge.target))
  const childrenByParent = new Map<string, string[]>()

  for (const edge of edges) {
    const children = childrenByParent.get(edge.source) ?? []
    children.push(edge.target)
    childrenByParent.set(edge.source, children)
  }

  const roots = nodes
    .filter((node) => !incoming.has(node.id))
    .sort((left, right) => left.data.groupKey.localeCompare(right.data.groupKey) || right.data.updatedAt - left.data.updatedAt)

  const groupedRoots = new Map<string, string[]>()
  for (const root of roots) {
    const rootIds = groupedRoots.get(root.data.groupKey) ?? []
    rootIds.push(root.id)
    groupedRoots.set(root.data.groupKey, rootIds)
  }

  const laidOut = new Map<string, Node<AgentNodeData>>()
  let xCursor = 0

  for (const [, rootIds] of [...groupedRoots.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let columnX = 0
    let columnY = 0
    let currentColumnWidth = NODE_WIDTH
    let maxGroupWidth = NODE_WIDTH

    for (const rootId of rootIds) {
      const subtreeIds = collectSubtreeIds(rootId, childrenByParent)
      const subtreeNodes = subtreeIds.map((id) => nodeMap.get(id)).filter((node): node is Node<AgentNodeData> => Boolean(node))
      const subtreeEdgeIds = new Set(subtreeIds)
      const subtreeEdges = edges.filter((edge) => subtreeEdgeIds.has(edge.source) && subtreeEdgeIds.has(edge.target))
      const subtree = layoutSubtree(subtreeNodes, subtreeEdges)
      const subtreeHeight = subtree.bounds.height + GROUP_PADDING_Y
      const subtreeWidth = subtree.bounds.width + GROUP_PADDING_X

      if (columnY > 0 && columnY + subtreeHeight > MAX_GROUP_COLUMN_HEIGHT) {
        columnX += currentColumnWidth + GROUP_GAP_X
        columnY = 0
        currentColumnWidth = NODE_WIDTH
      }

      for (const node of subtree.nodes) {
        laidOut.set(
          node.id,
          node.data.pinned
            ? node
            : {
                ...node,
                position: {
                  x: xCursor + columnX + GROUP_PADDING_X + node.position.x,
                  y: columnY + GROUP_PADDING_Y + node.position.y,
                },
              },
        )
      }

      columnY += subtree.bounds.height + GROUP_GAP_Y
      currentColumnWidth = Math.max(currentColumnWidth, subtreeWidth)
      maxGroupWidth = Math.max(maxGroupWidth, columnX + currentColumnWidth)
    }

    xCursor += maxGroupWidth + GROUP_GAP_X + GROUP_PADDING_X * 2
  }

  const positionedNodes = nodes.map((node) => laidOut.get(node.id) ?? node)
  const groupedNodes = new Map<string, Node<AgentNodeData>[]>()

  for (const node of positionedNodes) {
    const groupNodes = groupedNodes.get(node.data.groupKey) ?? []
    groupNodes.push(node)
    groupedNodes.set(node.data.groupKey, groupNodes)
  }

  const groupHeaders = [...groupedNodes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupKey, groupNodes]) => {
      const bounds = computeBounds(groupNodes)
      const rootCount = groupNodes.filter((node) => !incoming.has(node.id)).length
      return {
        id: `group-header:${groupKey}`,
        key: groupKey,
        label: groupKey,
        x: bounds.minX,
        y: Math.max(bounds.minY - 54, 0),
        rootCount,
      }
    })

  return { nodes: positionedNodes, groupHeaders }
}

function edgeStyleForStatus(status: NodeStatus) {
  if (status === 'needs-permission') {
    return { animated: true, style: { stroke: '#eab308', strokeDasharray: '5 3' } }
  }
  if (status === 'needs-answer') {
    return { animated: true, style: { stroke: '#f97316', strokeDasharray: '5 3' } }
  }
  return { animated: false, style: { stroke: '#374151', strokeDasharray: undefined } }
}

function edgeStyleForRelationType(type: RelationType, base: ReturnType<typeof edgeStyleForStatus>) {
  switch (type) {
    case 'fork':
      return { animated: base.animated, style: { ...base.style, stroke: base.style.stroke === '#374151' ? '#14b8a6' : base.style.stroke, strokeDasharray: '8 4' } }
    case 'linked':
      return { animated: base.animated, style: { ...base.style, stroke: base.style.stroke === '#374151' ? '#818cf8' : base.style.stroke, strokeDasharray: '4 2' } }
    case 'detached':
      return { animated: base.animated, style: { ...base.style, stroke: '#6b7280', strokeDasharray: '2 6' } }
    default:
      return base
  }
}

function edgeStyleForSession(
  session: SessionInfo,
  status: NodeStatus,
  relationTypeBySessionId: Map<string, RelationType>,
) {
  const base = edgeStyleForStatus(status)
  const relationType = relationTypeBySessionId.get(session.id)
  if (relationType) return edgeStyleForRelationType(relationType, base)
  if (session.forkedFromSessionID) return edgeStyleForRelationType('fork', base)
  return base
}

function sessionIdFromEvent(properties: Record<string, unknown>) {
  if (typeof properties.sessionID === 'string') return properties.sessionID
  const info = properties.info as { sessionID?: string; id?: string } | undefined
  if (typeof info?.sessionID === 'string') return info.sessionID
  return undefined
}

function buildGraph(
  sessions: SessionInfo[],
  viewMode: ViewMode,
  statusBySession: Record<string, NodeStatus>,
  lastActivityBySession: Record<string, string>,
  relations: SessionRelation[] = [],
  pendingPermissions: Record<string, unknown> = {},
  pendingQuestions: Record<string, unknown> = {},
  taskInvocations: TaskInvocation[] = [],
): Pick<AgentStore, 'nodes' | 'edges' | 'groupHeaders'> {
  const taskCountByParent = new Map<string, number>()
  const pendingTaskCountByParent = new Map<string, number>()
  const incomingTaskByChild = new Map<string, TaskInvocation>()
  for (const t of taskInvocations) {
    taskCountByParent.set(t.parent_session_id, (taskCountByParent.get(t.parent_session_id) ?? 0) + 1)
    if (!t.child_session_id) {
      pendingTaskCountByParent.set(t.parent_session_id, (pendingTaskCountByParent.get(t.parent_session_id) ?? 0) + 1)
    }
    if (t.child_session_id) incomingTaskByChild.set(t.child_session_id, t)
  }
  const rawNodes: Node<AgentNodeData>[] = sessions.map((session) => {
    const childIds = sessions.filter((s) => s.parentID === session.id).map((s) => s.id)
    const childPendingCount = childIds.filter((id) => pendingPermissions[id] || pendingQuestions[id]).length
    return {
      id: session.id,
      type: 'agentNode',
      position: {
        x: session.canvas?.x ?? 0,
        y: session.canvas?.y ?? 0,
      },
      data: {
        label: session.canvas?.label ?? session.title ?? session.id.slice(0, 8),
        status: statusBySession[session.id] ?? 'idle',
        sessionId: session.id,
        directory: session.directory,
        forkedFromSessionId: session.forkedFromSessionID ?? null,
        pinned: Boolean(session.canvas?.pinned),
        updatedAt: session.time.updated,
        createdAt: session.time.created,
        groupKey: projectGroupFromDirectory(session.directory),
        lastActivity: lastActivityBySession[session.id] ?? '',
        childPendingCount,
        hasParent: Boolean(session.parentID),
        detached: Boolean(session.canvas?.detached),
        taskCount: taskCountByParent.get(session.id) ?? 0,
        pendingTaskCount: pendingTaskCountByParent.get(session.id) ?? 0,
        incomingTask: incomingTaskByChild.get(session.id),
      },
    }
  })

  const relationTypeBySessionId = new Map<string, RelationType>(
    relations.map((r) => [r.to_session_id, r.relation_type as RelationType]),
  )

  const rawEdges: Edge[] = sessions
    .filter((session) => session.parentID)
    .map((session) => {
      const status = statusBySession[session.id] ?? 'idle'
      const incoming = incomingTaskByChild.get(session.id)
      return {
        id: `${session.parentID}-${session.id}`,
        source: session.parentID!,
        target: session.id,
        type: 'agentEdge',
        ...(incoming ? { data: { kind: 'task', label: incoming.agent } } : {}),
        ...edgeStyleForSession(session, status, relationTypeBySessionId),
      }
    })

  // Add overlay relation edges (linked, detached) — skip orphaned relations
  const sessionIds = new Set(sessions.map((s) => s.id))
  for (const rel of relations) {
    if (rel.relation_type === 'fork') continue
    if (!sessionIds.has(rel.from_session_id) || !sessionIds.has(rel.to_session_id)) continue
    const base = edgeStyleForStatus('idle')
    rawEdges.push({
      id: `rel-${rel.id}`,
      source: rel.from_session_id,
      target: rel.to_session_id,
      type: 'agentEdge',
      ...edgeStyleForRelationType(rel.relation_type as RelationType, base),
    })
  }

  const visibleIds = computeVisibleIds(rawNodes, rawEdges, viewMode)
  const visibleNodes = rawNodes.filter((node) => visibleIds.has(node.id))
  const visibleEdges = rawEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
  const layout = computeLayout(visibleNodes, visibleEdges)

  return {
    nodes: layout.nodes,
    edges: visibleEdges,
    groupHeaders: layout.groupHeaders,
  }
}

function rebuildGraph(state: {
  sessions: SessionInfo[]
  viewMode: ViewMode
  statusBySession: Record<string, NodeStatus>
  lastActivityBySession: Record<string, string>
  relations: SessionRelation[]
  pendingPermissions: Record<string, unknown>
  pendingQuestions: Record<string, unknown>
  taskInvocations: TaskInvocation[]
  activeProjectKey: string | null
}) {
  const filtered = state.activeProjectKey
    ? state.sessions.filter((s) => s.projectId === state.activeProjectKey)
    : state.sessions
  return buildGraph(
    filtered, state.viewMode, state.statusBySession, state.lastActivityBySession,
    state.relations, state.pendingPermissions, state.pendingQuestions, state.taskInvocations,
  )
}

type AgentStore = {
  sessions: SessionInfo[]
  statusBySession: Record<string, NodeStatus>
  lastActivityBySession: Record<string, string>
  relations: SessionRelation[]
  viewMode: ViewMode
  nodes: Node<AgentNodeData>[]
  edges: Edge[]
  groupHeaders: GroupHeader[]
  compat: CompatInfo | null
  selectedSessionId: string | null
  subtaskTargetSessionId: string | null
  pendingPermissions: Record<string, unknown>
  pendingQuestions: Record<string, unknown>
  taskInvocations: TaskInvocation[]
  todosBySession: Record<string, Array<{ id: string; description: string; status: string }>>
  diffBySession: Record<string, { summary?: string; changedFiles?: string[] }>
  projects: Project[]
  appView: AppView
  activeProjectKey: string | null
  pendingScrollToSessionId: string | null
  sseStatus: SseStatus
  setSseStatus: (status: SseStatus) => void
  addRelation: (fromSessionId: string, toSessionId: string, relationType: string) => Promise<void>
  removeRelation: (id: number) => Promise<void>
  setSelectedSession: (id: string | null) => void
  setSubtaskTargetSession: (id: string | null) => void
  setViewMode: (mode: ViewMode) => void
  setAppView: (view: AppView) => void
  setActiveProjectKey: (key: string | null) => void
  createProject: (name: string, directory?: string) => Promise<{ id: string }>
  setPendingScrollToSessionId: (id: string | null) => void
  onNodesChange: (changes: NodeChange[]) => void
  pinNode: (sessionId: string, position: { x: number; y: number }) => void
  applySessionTree: (payload: TreePayload) => void
  applyEvent: (event: AgentEvent) => void
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  sessions: [],
  statusBySession: {},
  lastActivityBySession: {},
  relations: [],
  viewMode: 'recent',
  nodes: [],
  edges: [],
  groupHeaders: [],
  compat: null,
  selectedSessionId: null,
  subtaskTargetSessionId: null,
  pendingPermissions: {},
  pendingQuestions: {},
  taskInvocations: [],
  todosBySession: {},
  diffBySession: {},
  projects: [],
  appView: 'home',
  activeProjectKey: null,
  pendingScrollToSessionId: null,
  sseStatus: 'disconnected',
  setSseStatus: (status) => set({ sseStatus: status }),

  addRelation: async (fromSessionId, toSessionId, relationType) => {
    const res = await fetch('/api/relation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromSessionId, toSessionId, relationType }),
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const treeRes = await fetch('/api/tree')
    if (!treeRes.ok) throw new Error(`${treeRes.status} ${treeRes.statusText}`)
    get().applySessionTree(await treeRes.json())
  },

  removeRelation: async (id) => {
    const res = await fetch(`/api/relation/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const treeRes = await fetch('/api/tree')
    if (!treeRes.ok) throw new Error(`${treeRes.status} ${treeRes.statusText}`)
    get().applySessionTree(await treeRes.json())
  },

  setSelectedSession: (id) => set({ selectedSessionId: id }),
  setSubtaskTargetSession: (id) => set({ subtaskTargetSessionId: id }),
  setAppView: (view) => set({ appView: view }),
  setActiveProjectKey: (key) =>
    set((state) => ({
      activeProjectKey: key,
      ...rebuildGraph({ ...state, activeProjectKey: key }),
    })),
  createProject: async (name, directory) => {
    const res = await fetch('/api/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, directory }),
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const proj = await res.json()
    const treeRes = await fetch('/api/tree')
    if (treeRes.ok) get().applySessionTree(await treeRes.json())
    return proj
  },
  setPendingScrollToSessionId: (id) => set({ pendingScrollToSessionId: id }),

  setViewMode: (mode) =>
    set((state) => ({
      viewMode: mode,
      ...rebuildGraph({ ...state, viewMode: mode }),
    })),

  onNodesChange: (changes) =>
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as Node<AgentNodeData>[],
    })),

  pinNode: (sessionId, position) =>
    set((state) => {
      const sessions = state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              canvas: {
                ...session.canvas,
                x: position.x,
                y: position.y,
                pinned: true,
              },
            }
          : session,
      )

      return {
        sessions,
        ...rebuildGraph({ ...state, sessions }),
      }
    }),

  applySessionTree: ({ sessions, statusBySession = {}, compat = null, relations = [], taskInvocations = [], projects }) =>
    set((state) => {
      const mergedStatus = { ...state.statusBySession, ...statusBySession }
      const newProjects = projects
        ? projects.map((p) => ({ id: p.id, name: p.name, directoryKey: p.directory_key ?? null, userCreated: Boolean(p.user_created), createdAt: p.created_at }))
        : state.projects
      return {
        sessions,
        statusBySession: mergedStatus,
        compat,
        relations,
        taskInvocations,
        projects: newProjects,
        ...rebuildGraph({ ...state, sessions, statusBySession: mergedStatus, relations, taskInvocations }),
      }
    }),

  applyEvent: (event) => {
    const properties = event.properties
    const sessionId = sessionIdFromEvent(properties)

    switch (event.type) {
      case 'session.status':
      case 'session.idle':
      case 'session.error':
      case 'permission.updated':
      case 'permission.asked':
      case 'question.updated':
      case 'question.asked':
      case 'permission.replied':
      case 'question.replied':
      case 'question.rejected': {
        const nextStatus =
          event.type === 'session.status'
            ? 'running'
            : event.type === 'session.idle'
              ? 'idle'
              : event.type === 'session.error'
                ? 'failed'
                : event.type === 'permission.updated' || event.type === 'permission.asked'
                  ? 'needs-permission'
                  : event.type === 'question.updated' || event.type === 'question.asked'
                    ? 'needs-answer'
                    : 'running'

        set((state) => {
          const statusBySession: Record<string, NodeStatus> = sessionId
            ? { ...state.statusBySession, [sessionId]: nextStatus }
            : state.statusBySession

          const pendingPermissions = { ...state.pendingPermissions }
          const pendingQuestions = { ...state.pendingQuestions }

          if (sessionId && (event.type === 'permission.updated' || event.type === 'permission.asked')) {
            pendingPermissions[sessionId] = properties
          }
          if (sessionId && (event.type === 'question.updated' || event.type === 'question.asked')) {
            pendingQuestions[sessionId] = properties
          }
          if (sessionId && event.type === 'permission.replied') {
            delete pendingPermissions[sessionId]
          }
          if (sessionId && (event.type === 'question.replied' || event.type === 'question.rejected')) {
            delete pendingQuestions[sessionId]
          }

          const lastActivityBySession =
            sessionId && event.type === 'session.idle'
              ? { ...state.lastActivityBySession, [sessionId]: `idle-${Date.now()}` }
              : state.lastActivityBySession

          return {
            statusBySession,
            pendingPermissions,
            pendingQuestions,
            lastActivityBySession,
            ...rebuildGraph({ ...state, statusBySession, lastActivityBySession, pendingPermissions, pendingQuestions }),
          }
        })
        return
      }

      case 'message.part.delta':
      case 'message.part.updated': {
        if (!sessionId) return
        const delta = properties.delta as MessageDelta | undefined
        const part = properties.part as MessageDelta | undefined
        const text = delta?.text ?? part?.text
        if (text && text.trim()) {
          set((state) => {
            const lastActivityBySession = {
              ...state.lastActivityBySession,
              [sessionId]: text.slice(-200),
            }
            return {
              lastActivityBySession,
              ...rebuildGraph({ ...state, lastActivityBySession }),
            }
          })
        }
        return
      }

      case 'session.created': {
        const info = properties.info as SessionInfo | undefined
        if (!info) return

        set((state) => {
          const existingIndex = state.sessions.findIndex((session) => session.id === info.id)
          const sessions =
            existingIndex >= 0
              ? state.sessions.map((session) => (session.id === info.id ? info : session))
              : [...state.sessions, info]

          return {
            sessions,
            ...rebuildGraph({ ...state, sessions }),
          }
        })
        return
      }

      case 'session.updated': {
        const info = properties.info as SessionInfo | undefined
        if (!info) return

        set((state) => {
          const sessions = state.sessions.map((session) => {
            if (session.id !== info.id) return session
            return {
              ...info,
              canvas: session.canvas,
            }
          })

          return {
            sessions,
            ...rebuildGraph({ ...state, sessions }),
          }
        })
        return
      }

      case 'todo.updated': {
        if (!sessionId) return
        const todos = Array.isArray(properties.todos) ? properties.todos : []
        set((state) => ({
          todosBySession: {
            ...state.todosBySession,
            [sessionId]: todos.map((todo, index) => {
              const item = todo as { id?: string; content?: string; description?: string; status?: string }
              return {
                id: item.id ?? `${sessionId}-${index}`,
                description: item.description ?? item.content ?? '',
                status: item.status ?? 'pending',
              }
            }),
          },
        }))
        return
      }

      case 'session.diff': {
        if (!sessionId) return
        set((state) => ({
          diffBySession: {
            ...state.diffBySession,
            [sessionId]: properties as { summary?: string; changedFiles?: string[] },
          },
        }))
        return
      }

      case 'command.executed': {
        if (!sessionId) return
        set((state) => ({
          lastActivityBySession: {
            ...state.lastActivityBySession,
            [sessionId]: String(Date.now()),
          },
        }))
        return
      }

      case 'session.deleted': {
        const deletedSessionId = sessionId ?? ((properties.info as { id?: string } | undefined)?.id ?? null)
        if (!deletedSessionId) return

        set((state) => {
          const sessions = state.sessions.filter((session) => session.id !== deletedSessionId)
          const { [deletedSessionId]: _status, ...statusBySession } = state.statusBySession
          const { [deletedSessionId]: _permission, ...pendingPermissions } = state.pendingPermissions
          const { [deletedSessionId]: _question, ...pendingQuestions } = state.pendingQuestions
          const { [deletedSessionId]: _activity, ...lastActivityBySession } = state.lastActivityBySession
          const { [deletedSessionId]: _todos, ...todosBySession } = state.todosBySession
          const { [deletedSessionId]: _diff, ...diffBySession } = state.diffBySession

          return {
            sessions,
            statusBySession,
            pendingPermissions,
            pendingQuestions,
            lastActivityBySession,
            todosBySession,
            diffBySession,
            selectedSessionId: state.selectedSessionId === deletedSessionId ? null : state.selectedSessionId,
            ...rebuildGraph({ ...state, sessions, statusBySession, lastActivityBySession, pendingPermissions, pendingQuestions }),
          }
        })
      }
    }
  },
}))
