import type { ActiveProjectKey, Project } from '../store/agentStore'

type Props = {
  projects: Project[]
  activeProjectKey: ActiveProjectKey
  totalSessionCount: number
  onBack: () => void
  onSelectAll: () => void
}

export function ProjectTabBar({ projects, activeProjectKey, totalSessionCount, onBack, onSelectAll }: Props) {
  const activeProject = activeProjectKey ? projects.find((p) => p.id === activeProjectKey) : null

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 40,
        zIndex: 10,
        background: '#0a0a0a',
        borderBottom: '1px solid #1f2937',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        userSelect: 'none',
      }}
    >
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: '1px solid #334155',
          color: '#64748b',
          borderRadius: 6,
          padding: '3px 10px',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        ← Projects
      </button>
      <div style={{ width: 1, height: 16, background: '#1f2937', flexShrink: 0 }} />
      {activeProject ? (
        <span
          style={{
            color: '#e2e8f0',
            fontSize: 12,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activeProject.name}
        </span>
      ) : (
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          All Sessions
          <span style={{ color: '#475569', marginLeft: 6, fontSize: 11 }}>({totalSessionCount})</span>
        </span>
      )}
      {activeProject && (
        <>
          <div style={{ flex: 1 }} />
          <button
            onClick={onSelectAll}
            style={{
              background: 'none',
              border: 'none',
              color: '#475569',
              fontSize: 11,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            All Sessions
          </button>
        </>
      )}
    </div>
  )
}
