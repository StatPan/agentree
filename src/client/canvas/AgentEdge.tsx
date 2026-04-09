import { BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react'

export function AgentEdge({ sourceX, sourceY, targetX, targetY, style, markerEnd, data }: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  const label = typeof data?.label === 'string' ? data.label : null
  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: '#374151', strokeWidth: 1.5, ...style }}
      />
      {label && (
        <foreignObject
          width={96}
          height={22}
          x={(sourceX + targetX) / 2 - 48}
          y={(sourceY + targetY) / 2 - 11}
          style={{ overflow: 'visible', pointerEvents: 'none' }}
        >
          <div
            style={{
              display: 'inline-flex',
              maxWidth: 96,
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              borderRadius: 999,
              background: '#172554',
              border: '1px solid #2563eb',
              color: '#bfdbfe',
              fontSize: 9,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              boxShadow: '0 0 0 2px #020617',
            }}
          >
            TASK {label}
          </div>
        </foreignObject>
      )}
    </>
  )
}
