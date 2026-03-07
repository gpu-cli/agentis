// ============================================================================
// Agent Inspection Panel — Side panel showing agent details
// ============================================================================

import { useAgentStore } from '../stores/agentStore'
import { useEventStore, describeEvent, getErrorDetail, getToolDetail, EVENT_TYPE_ICONS } from '../stores/eventStore'
import { useUIStore } from '../stores/uiStore'
import { useUniverseStore } from '../stores/universeStore'
import { DEFAULT_TOOLS } from '@multiverse/shared'
import { SpriteIcon, resolveToolIcon } from './SpriteIcon'
import { ResizableSidePanel } from './ResizableSidePanel'
import { AgentChatPanel } from './AgentChatPanel'
import { AgentTypeLogo, AGENT_TYPE_META } from './AgentTypeLogo'
import { ScrollArea } from '@multiverse/ui'

/** Wrap filename-like tokens in a description string with <code> tags */
function formatDescription(text: string): React.ReactNode {
  // Match tokens that look like filenames (word chars/hyphens + dot + extension)
  const parts = text.split(/(\S+\.\w{1,10})/)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    /^\S+\.\w{1,10}$/.test(part)
      ? <code key={i} className="bg-gray-600/50 px-1 rounded text-gray-200">{part}</code>
      : part
  )
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  idle: 'Idle',
  combat: 'Combat',
  offline: 'Offline',
}

const STATUS_ORB_COLORS: Record<string, string> = {
  active: 'bg-green-400 shadow-green-400/50',
  idle: 'bg-yellow-400 shadow-yellow-400/50',
  combat: 'bg-red-400 shadow-red-400/50',
  offline: 'bg-gray-500 shadow-gray-500/50',
}


// Tool icons now use SpriteIcon + resolveToolIcon() from SpriteIcon.tsx
// (powered by EntitySpriteMap). Legacy TOOL_EMOJI removed.

// Re-export for backwards compatibility — canonical source is ./AgentTypeLogo
export { AgentTypeLogo, AGENT_TYPE_META } from './AgentTypeLogo'

const CHUNK_SIZE = 64

/** Resolve an agent's position to a meaningful location string */
function resolveLocation(agentId: string): string {
  const agent = useAgentStore.getState().agents.get(agentId)
  if (!agent) return 'Unknown'

  const islands = useUniverseStore.getState().islands
  const districts = useUniverseStore.getState().districts
  const buildings = useUniverseStore.getState().buildings

  // Agent tile position (not pixel — tile coordinates)
  const ax = agent.position.chunk_x * CHUNK_SIZE + agent.position.local_x
  const ay = agent.position.chunk_y * CHUNK_SIZE + agent.position.local_y

  let closestIsland: string | null = null
  let closestDistrict: string | null = null
  let closestBuilding: string | null = null

  // Find which island the agent is on (using tile coords)
  for (const island of islands.values()) {
    const ix = island.position.chunk_x * CHUNK_SIZE + island.position.local_x
    const iy = island.position.chunk_y * CHUNK_SIZE + island.position.local_y
    const iw = island.bounds.width
    const ih = island.bounds.height
    if (ax >= ix && ax < ix + iw && ay >= iy && ay < iy + ih) {
      closestIsland = island.name
      break
    }
  }

  // Find which district the agent is in (using tile coords)
  for (const district of districts.values()) {
    const dx = district.position.chunk_x * CHUNK_SIZE + district.position.local_x
    const dy = district.position.chunk_y * CHUNK_SIZE + district.position.local_y
    const dw = district.bounds.width
    const dh = district.bounds.height
    if (ax >= dx && ax < dx + dw && ay >= dy && ay < dy + dh) {
      closestDistrict = district.name
      // Check buildings in this district
      for (const building of buildings.values()) {
        if (building.district_id !== district.id) continue
        const bx = building.position.chunk_x * CHUNK_SIZE + building.position.local_x
        const by = building.position.chunk_y * CHUNK_SIZE + building.position.local_y
        const bw = building.footprint.width
        const bh = building.footprint.height
        if (ax >= bx && ax < bx + bw && ay >= by && ay < by + bh) {
          const segments = building.name.split('/')
          closestBuilding = segments[segments.length - 1] ?? building.name
          break
        }
      }
      break
    }
  }

  const parts: string[] = []
  if (closestIsland) parts.push(closestIsland)
  if (closestDistrict) parts.push(closestDistrict)
  if (closestBuilding) parts.push(closestBuilding)

  return parts.length > 0 ? parts.join(' › ') : 'Exploring…'
}

export function AgentPanel() {
  const selectedId = useUIStore((s) => s.selectedEntityId)
  const selectedType = useUIStore((s) => s.selectedEntityType)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const setFollowAgent = useUIStore((s) => s.setFollowAgent)
  const followAgentId = useUIStore((s) => s.followAgentId)
  const setConversationAgent = useUIStore((s) => s.setConversationAgent)
  const conversationAgentId = useUIStore((s) => s.conversationAgentId)
  const agents = useAgentStore((s) => s.agents)
  const spriteAssignment = useAgentStore((s) => s.spriteAssignment)
  const getAgentEvents = useEventStore((s) => s.getAgentEvents)

  if (selectedType !== 'agent' || !selectedId) return null

  const agent = agents.get(selectedId)
  if (!agent) return null

  const recentEvents = getAgentEvents(agent.id, 50)
  const isFollowing = followAgentId === agent.id
  const isTalking = conversationAgentId === agent.id
  const typeMeta = AGENT_TYPE_META[agent.type]
  const location = resolveLocation(agent.id)

  return (
    <ResizableSidePanel>
      {/* When chatting, show only the embedded chat — fills the entire sidebar */}
      {isTalking ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <AgentChatPanel agentId={agent.id} />
        </div>
      ) : (
        <div className="p-4 h-full max-h-screen flex flex-col">
          {/* Header — name + status orb + type logo + close */}
          <div className="flex items-center gap-2 mb-5">
            <h2 className="font-pixel text-sm text-green-400 flex-1 min-w-0 truncate">
              {agent.name}
            </h2>
            {/* Status orb */}
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full shadow-sm shrink-0 ${STATUS_ORB_COLORS[agent.status] ?? 'bg-gray-500'}`}
              title={STATUS_LABELS[agent.status] ?? agent.status}
            />
            {/* Type logo with tooltip */}
            <div className="group relative shrink-0">
              <AgentTypeLogo type={agent.type} size={20} />
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                <div className="bg-gray-900 text-gray-100 text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap border border-gray-600">
                  {typeMeta?.label ?? agent.type}
                </div>
                <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[4px] border-l-transparent border-r-transparent border-b-gray-900 mx-auto rotate-180 -mt-[5px]" />
              </div>
            </div>
            {/* Close button */}
            <button
              onClick={clearSelection}
              className="text-gray-500 hover:text-white text-lg shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-700 transition-colors"
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>

          {/* Current Task */}
          {agent.current_task && (
            <div className="mb-4 bg-gray-700/60 rounded-lg px-3 py-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">Current Task</span>
              <p className="text-sm text-blue-300 mt-0.5">{agent.current_task.title}</p>
            </div>
          )}

          {/* Key Actions — Follow + Talk side by side */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() =>
                isFollowing
                  ? setFollowAgent(null)
                  : setFollowAgent(agent.id)
              }
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:outline-none ${
                isFollowing
                  ? 'bg-green-700 text-green-100 hover:bg-green-600'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              aria-label={isFollowing ? 'Stop following agent' : 'Follow agent camera'}
            >
              <SpriteIcon region="chains" size={18} className="shrink-0" />
              <span className="font-pixel leading-none">{isFollowing ? 'Following' : 'Follow'}</span>
            </button>
            <button
              onClick={() => setConversationAgent(agent.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none bg-gray-700 text-gray-300 hover:bg-gray-600"
              aria-label="Chat with agent"
            >
              <SpriteIcon region={spriteAssignment.get(agent.id) ?? 'hero_knight'} size={18} className="shrink-0" />
              <span className="font-pixel leading-none">Chat</span>
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700 mb-4" />

          {/* Tools */}
          <div className="mb-4">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 block">
              Tools
            </span>
            <div className="flex flex-wrap gap-1.5">
              {agent.tools
                .filter((t) => t.enabled)
                .map((tool) => {
                  const def = DEFAULT_TOOLS[tool.tool_id.replace('tool_', '')]
                  const isActive = agent.active_tool === tool.tool_id
                  const tooltipLabel = def?.label ?? tool.tool_id.replace('tool_', '').replace(/_/g, ' ')
                  return (
                    <div
                      key={tool.tool_id}
                      className={`group relative inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                        isActive
                          ? 'bg-yellow-600/30 ring-1 ring-yellow-500 text-yellow-200'
                          : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <SpriteIcon region={resolveToolIcon(tool.tool_id)} size={14} className="shrink-0" />
                      <span>{tooltipLabel}</span>
                      {tool.usage_count > 0 && (
                        <span className="bg-blue-600/80 text-[9px] px-1 rounded-full text-blue-100">
                          {tool.usage_count}
                        </span>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700 mb-4" />

          {/* Location — meaningful breadcrumb */}
          <div className="mb-4">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Location</span>
            <p className="text-xs text-gray-300 mt-0.5">
              📍 {location}
            </p>
          </div>

          {/* Action Log */}
          <ScrollArea>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 block">
              Recent Actions
            </span>
            <div className="space-y-1">
              {recentEvents.length === 0 && (
                <p className="text-xs text-gray-600 italic">No events yet</p>
              )}
              {recentEvents.map((log) => {
                const description = describeEvent(log.event)
                const errorDetail = getErrorDetail(log.event)
                const toolDetail = getToolDetail(log.event)
                const icon = EVENT_TYPE_ICONS[log.event.type] ?? '📌'
                return (
                  <div
                    key={log.event.id}
                    className="text-xs bg-gray-700/50 rounded px-2.5 py-1.5 flex items-start gap-1.5"
                  >
                    <span className="shrink-0 mt-0.5">{icon}</span>
                    <div className="min-w-0 flex-1">
                      <span className="text-gray-300">{formatDescription(description)}</span>
                      {toolDetail && (
                        <p className="text-[9px] text-gray-400 font-mono leading-tight truncate mt-0.5">
                          {toolDetail}
                        </p>
                      )}
                      {errorDetail && (
                        <p className="text-[9px] text-red-400/80 leading-tight truncate mt-0.5">
                          {errorDetail}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </ResizableSidePanel>
  )
}


