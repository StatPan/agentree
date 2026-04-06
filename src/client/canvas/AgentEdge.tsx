import { BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react'

export function AgentEdge({ sourceX, sourceY, targetX, targetY, style, markerEnd }: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{ stroke: '#374151', strokeWidth: 1.5, ...style }}
    />
  )
}
