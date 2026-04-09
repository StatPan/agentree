import { Component, useEffect, type ReactNode } from 'react'
import { AgentCanvas } from './canvas/AgentCanvas'
import { SessionPanel } from './panel/SessionPanel'
import { ApprovalQueue } from './panel/ApprovalQueue'
import { SubtaskDialog } from './panel/SubtaskDialog'
import { SessionListSidebar } from './canvas/SessionListSidebar'
import { HomeScreen } from './HomeScreen'
import { useAgentStore } from './store/agentStore'

// C5: Error Boundary — catches render errors and shows recovery UI
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          width: '100vw', height: '100vh', background: '#0f0f0f', color: '#e5e7eb', fontFamily: 'monospace',
        }}>
          <h2 style={{ color: '#ef4444', marginBottom: 12 }}>Something went wrong</h2>
          <pre style={{ color: '#94a3b8', fontSize: 13, maxWidth: 600, whiteSpace: 'pre-wrap', marginBottom: 20 }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            style={{
              padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none',
              borderRadius: 6, cursor: 'pointer', fontSize: 14,
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const appView = useAgentStore((s) => s.appView)
  const selectedSessionId = useAgentStore((s) => s.selectedSessionId)
  const subtaskTargetSessionId = useAgentStore((s) => s.subtaskTargetSessionId)
  const setSubtaskTargetSession = useAgentStore((s) => s.setSubtaskTargetSession)
  const applySessionTree = useAgentStore((s) => s.applySessionTree)

  async function refreshTree() {
    const response = await fetch('/api/tree')
    const data = await response.json()
    applySessionTree(data)
  }

  useEffect(() => {
    void refreshTree()
  }, [])

  return (
    <ErrorBoundary>
      {appView === 'home' ? (
        <HomeScreen />
      ) : (
        <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#0f0f0f', overflow: 'hidden' }}>
          <SessionListSidebar />
          <div style={{ flex: 1, position: 'relative' }}>
            <AgentCanvas />
          </div>
          {selectedSessionId && <SessionPanel sessionId={selectedSessionId} />}
          <ApprovalQueue />
          {subtaskTargetSessionId && (
            <SubtaskDialog
              sessionId={subtaskTargetSessionId}
              onClose={() => setSubtaskTargetSession(null)}
              onCreated={() => {
                void refreshTree()
              }}
            />
          )}
        </div>
      )}
    </ErrorBoundary>
  )
}
