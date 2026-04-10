import { useState } from 'react'
import { useAgentStore, STATUS_COLORS } from './store/agentStore'
import type { Project } from './store/agentStore'

function ProjectCard({
  project,
  sessionCount,
  runningCount,
  pendingCount,
  onEnter,
}: {
  project: Project
  sessionCount: number
  runningCount: number
  pendingCount: number
  onEnter: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [nameValue, setNameValue] = useState(project.name)

  async function saveName() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === project.name) {
      setNameValue(project.name)
      setEditing(false)
      return
    }
    await fetch(`/api/project/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    setEditing(false)
  }

  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1f2937',
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 240,
        maxWidth: 340,
        flex: '1 1 240px',
        transition: 'border-color 0.15s',
        cursor: 'default',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#334155' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1f2937' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {editing ? (
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveName()
              if (e.key === 'Escape') { setNameValue(project.name); setEditing(false) }
            }}
            style={{
              background: '#1e293b',
              border: '1px solid #38bdf8',
              borderRadius: 6,
              color: '#e2e8f0',
              fontSize: 15,
              fontWeight: 600,
              padding: '3px 8px',
              outline: 'none',
              flex: 1,
            }}
          />
        ) : (
          <span
            style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, cursor: 'text', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onClick={() => setEditing(true)}
            title="Click to rename"
          >
            {project.name}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#64748b', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
          {project.directoryKey}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          {sessionCount} session{sessionCount !== 1 ? 's' : ''}
        </span>
        {runningCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLORS.running, display: 'inline-block' }} />
            <span style={{ color: STATUS_COLORS.running }}>{runningCount} running</span>
          </span>
        )}
        {pendingCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLORS['needs-permission'], display: 'inline-block' }} />
            <span style={{ color: STATUS_COLORS['needs-permission'] }}>{pendingCount} pending</span>
          </span>
        )}
      </div>

      <button
        onClick={onEnter}
        style={{
          marginTop: 4,
          background: '#1d4ed8',
          color: '#eff6ff',
          border: 'none',
          borderRadius: 8,
          padding: '7px 0',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          width: '100%',
        }}
      >
        Enter →
      </button>
    </div>
  )
}

export function HomeScreen() {
  const projects = useAgentStore((s) => s.projects)
  const sessions = useAgentStore((s) => s.sessions)
  const statusBySession = useAgentStore((s) => s.statusBySession)
  const setActiveProjectKey = useAgentStore((s) => s.setActiveProjectKey)
  const setAppView = useAgentStore((s) => s.setAppView)
  const createProject = useAgentStore((s) => s.createProject)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  async function handleCreateProject() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const proj = await createProject(name)
      setNewName('')
      enterProject(proj.id)
    } catch (err) {
      console.error('[HomeScreen] create project failed', err)
    } finally {
      setCreating(false)
    }
  }

  const projectStats = projects.map((project) => {
    const projectSessions = sessions.filter((s) => s.projectId === project.id)
    const runningCount = projectSessions.filter((s) =>
      statusBySession[s.id] === 'running',
    ).length
    const pendingCount = projectSessions.filter((s) =>
      statusBySession[s.id] === 'needs-permission' || statusBySession[s.id] === 'needs-answer',
    ).length
    return { project, sessionCount: projectSessions.length, runningCount, pendingCount }
  })

  function enterProject(projectId: string) {
    setActiveProjectKey(projectId)
    setAppView('canvas')
  }

  function viewAll() {
    setActiveProjectKey(null)
    setAppView('canvas')
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0f0f0f',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 32px 16px',
          borderBottom: '1px solid #1f2937',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            agentree
          </span>
          <span style={{ color: '#334155', fontSize: 14 }}>—</span>
          <span style={{ color: '#475569', fontSize: 13 }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''}, {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="New project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateProject() }}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 8,
              color: '#e2e8f0',
              fontSize: 12,
              padding: '6px 10px',
              outline: 'none',
              width: 180,
            }}
          />
          <button
            onClick={() => void handleCreateProject()}
            disabled={creating || !newName.trim()}
            style={{
              background: '#1d4ed8',
              color: '#eff6ff',
              border: 'none',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: newName.trim() ? 'pointer' : 'default',
              opacity: newName.trim() ? 1 : 0.5,
            }}
          >
            + New Project
          </button>
          <button
            onClick={viewAll}
            style={{
              background: 'none',
              border: '1px solid #334155',
              color: '#94a3b8',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            View All
          </button>
        </div>
      </div>

      {/* Project grid */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px 32px',
        }}
      >
        {projectStats.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 12,
            }}
          >
            <span style={{ color: '#475569', fontSize: 14 }}>No projects yet</span>
            <span style={{ color: '#374151', fontSize: 12 }}>Create a project to organize your agent sessions</span>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              alignContent: 'flex-start',
            }}
          >
            {projectStats.map(({ project, sessionCount, runningCount, pendingCount }) => (
              <ProjectCard
                key={project.id}
                project={project}
                sessionCount={sessionCount}
                runningCount={runningCount}
                pendingCount={pendingCount}
                onEnter={() => enterProject(project.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
