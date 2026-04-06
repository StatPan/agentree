import type { NodeProps } from '@xyflow/react'

type GroupHeaderData = {
  label: string
  rootCount: number
}

export function GroupHeaderNode({ data }: NodeProps) {
  const header = data as GroupHeaderData

  return (
    <div
      style={{
        minWidth: 220,
        padding: '8px 12px',
        borderRadius: 10,
        border: '1px solid #334155',
        background: 'rgba(15, 23, 42, 0.88)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.24)',
        pointerEvents: 'none',
      }}
    >
      <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>{header.label}</div>
      <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
        {header.rootCount} root session{header.rootCount === 1 ? '' : 's'}
      </div>
    </div>
  )
}
