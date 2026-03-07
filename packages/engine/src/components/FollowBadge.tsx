// ============================================================================
// Follow Badge — Shows "Following: AgentName" when camera is tracking an agent
// ============================================================================

import { useUIStore } from '../stores/uiStore'
import { useAgentStore } from '../stores/agentStore'

export function FollowBadge() {
  const followAgentId = useUIStore((s) => s.followAgentId)
  const agents = useAgentStore((s) => s.agents)

  if (!followAgentId) return null

  const agent = agents.get(followAgentId)
  if (!agent) return null

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div className="bg-gray-900/70 backdrop-blur-sm rounded-lg px-4 py-2 border border-gray-700/50 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="font-pixel text-xs text-gray-200">
          Following: <span className="text-green-400">{agent.name}</span>
        </span>
        <span className="text-[10px] text-gray-500 ml-1">Esc to stop</span>
      </div>
    </div>
  )
}
