import { AgentCanvas } from './canvas/AgentCanvas'
import { SessionPanel } from './panel/SessionPanel'
import { ApprovalQueue } from './panel/ApprovalQueue'
import { SubtaskDialog } from './panel/SubtaskDialog'
import { useAgentStore } from './store/agentStore'

export default function App() {
  const selectedSessionId = useAgentStore((s) => s.selectedSessionId)
  const subtaskTargetSessionId = useAgentStore((s) => s.subtaskTargetSessionId)
  const setSubtaskTargetSession = useAgentStore((s) => s.setSubtaskTargetSession)
  const applySessionTree = useAgentStore((s) => s.applySessionTree)

  async function refreshTree() {
    const response = await fetch('/api/tree')
    const data = await response.json()
    applySessionTree(data)
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#0f0f0f', overflow: 'hidden' }}>
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
  )
}
