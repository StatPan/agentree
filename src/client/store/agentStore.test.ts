import { beforeEach, describe, expect, it } from 'vitest'
import { useAgentStore } from './agentStore.js'

// Reset store state before each test
function resetStore() {
  useAgentStore.setState({
    sessions: [],
    statusBySession: {},
    lastActivityBySession: {},
    relations: [],
    nodes: [],
    edges: [],
    groupHeaders: [],
    compat: null,
    selectedSessionId: null,
    subtaskTargetSessionId: null,
    pendingPermissions: {},
    pendingQuestions: {},
    todosBySession: {},
    diffBySession: {},
  })
}

// Minimal tree payload helpers
function session(id: string, parentID: string | null = null) {
  return {
    id,
    title: id,
    parentID,
    directory: '/workspace/test',
    time: { created: 1000, updated: 2000 },
  }
}

function relation(id: number, from: string, to: string, type: string) {
  return { id, from_session_id: from, to_session_id: to, relation_type: type as never, created_at: '' }
}

describe('buildGraph — relation edges on canvas', () => {
  beforeEach(resetStore)

  it('linked relation between two sessions produces a canvas edge', () => {
    const { applySessionTree, edges } = useAgentStore.getState()
    applySessionTree({
      sessions: [session('a'), session('b')],
      relations: [relation(1, 'a', 'b', 'linked')],
    })
    const after = useAgentStore.getState()
    const relEdge = after.edges.find((e) => e.id === 'rel-1')
    expect(relEdge).toBeDefined()
    expect(relEdge?.source).toBe('a')
    expect(relEdge?.target).toBe('b')
  })

  it('linked edge has indigo stroke (#818cf8)', () => {
    useAgentStore.getState().applySessionTree({
      sessions: [session('a'), session('b')],
      relations: [relation(1, 'a', 'b', 'linked')],
    })
    const relEdge = useAgentStore.getState().edges.find((e) => e.id === 'rel-1')
    expect((relEdge?.style as { stroke?: string } | undefined)?.stroke).toBe('#818cf8')
  })

  it('detached edge has gray stroke (#6b7280)', () => {
    useAgentStore.getState().applySessionTree({
      sessions: [session('a'), session('b')],
      relations: [relation(3, 'a', 'b', 'detached')],
    })
    const relEdge = useAgentStore.getState().edges.find((e) => e.id === 'rel-3')
    expect((relEdge?.style as { stroke?: string } | undefined)?.stroke).toBe('#6b7280')
  })

  it('fork relation does NOT create a separate edge (handled via forkedFromSessionID)', () => {
    useAgentStore.getState().applySessionTree({
      sessions: [session('a'), session('b')],
      relations: [relation(4, 'b', 'a', 'fork')],
    })
    const forkRelEdge = useAgentStore.getState().edges.find((e) => e.id === 'rel-4')
    expect(forkRelEdge).toBeUndefined()
  })

  it('parent-child hierarchy edges are preserved alongside relation edges', () => {
    useAgentStore.getState().applySessionTree({
      sessions: [session('root'), session('child', 'root'), session('other')],
      relations: [relation(5, 'root', 'other', 'linked')],
    })
    const st = useAgentStore.getState()
    const hierarchyEdge = st.edges.find((e) => e.source === 'root' && e.target === 'child')
    const relEdge = st.edges.find((e) => e.id === 'rel-5')
    expect(hierarchyEdge).toBeDefined()
    expect(relEdge).toBeDefined()
  })
})

describe('applyEvent — session.deleted cleanup', () => {
  beforeEach(resetStore)

  it('removes session from sessions list', () => {
    useAgentStore.getState().applySessionTree({ sessions: [session('a'), session('b')] })
    useAgentStore.getState().applyEvent({ type: 'session.deleted', properties: { sessionID: 'a' } })
    const remaining = useAgentStore.getState().sessions.map((s) => s.id)
    expect(remaining).toEqual(['b'])
  })

  it('clears todosBySession for deleted session', () => {
    useAgentStore.setState({ todosBySession: { 'a': [{ id: '1', description: 'task', status: 'pending' }], 'b': [] } })
    useAgentStore.getState().applyEvent({ type: 'session.deleted', properties: { sessionID: 'a' } })
    expect(useAgentStore.getState().todosBySession['a']).toBeUndefined()
    expect(useAgentStore.getState().todosBySession['b']).toBeDefined()
  })

  it('clears diffBySession for deleted session', () => {
    useAgentStore.setState({ diffBySession: { 'a': { summary: 'refactor' }, 'b': { summary: 'fix' } } })
    useAgentStore.getState().applyEvent({ type: 'session.deleted', properties: { sessionID: 'a' } })
    expect(useAgentStore.getState().diffBySession['a']).toBeUndefined()
    expect(useAgentStore.getState().diffBySession['b']).toBeDefined()
  })

  it('clears selectedSessionId if the deleted session was selected', () => {
    useAgentStore.setState({ selectedSessionId: 'a' })
    useAgentStore.getState().applyEvent({ type: 'session.deleted', properties: { sessionID: 'a' } })
    expect(useAgentStore.getState().selectedSessionId).toBeNull()
  })

  it('preserves selectedSessionId if a different session is deleted', () => {
    useAgentStore.setState({ selectedSessionId: 'b', sessions: [session('a'), session('b')] })
    useAgentStore.getState().applyEvent({ type: 'session.deleted', properties: { sessionID: 'a' } })
    expect(useAgentStore.getState().selectedSessionId).toBe('b')
  })
})

describe('applyEvent — session.diff', () => {
  beforeEach(resetStore)

  it('stores diff payload by sessionId', () => {
    useAgentStore.getState().applyEvent({
      type: 'session.diff',
      properties: { sessionID: 'a', summary: '3 files changed', changedFiles: ['a.ts', 'b.ts', 'c.ts'] },
    })
    const diff = useAgentStore.getState().diffBySession['a']
    expect(diff?.summary).toBe('3 files changed')
    expect(diff?.changedFiles).toHaveLength(3)
  })
})

describe('applyEvent — command.executed', () => {
  beforeEach(resetStore)

  it('updates lastActivityBySession to trigger panel refresh', () => {
    useAgentStore.getState().applyEvent({ type: 'command.executed', properties: { sessionID: 'a' } })
    expect(useAgentStore.getState().lastActivityBySession['a']).toBeTruthy()
  })
})
