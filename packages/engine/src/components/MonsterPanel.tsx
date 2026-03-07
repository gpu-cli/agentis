// ============================================================================
// Monster Inspection Panel — Side panel showing error/incident details
// when a monster sprite is clicked on the world map.
// ============================================================================

import { useUIStore } from '../stores/uiStore'
import { useMonsterStore } from '../stores/monsterStore'
import { useUniverseStore } from '../stores/universeStore'
import { useAgentStore } from '../stores/agentStore'
import { SpriteIcon } from './SpriteIcon'
import { ResizableSidePanel } from './ResizableSidePanel'
import { entitySprites } from '../engine/entity-sprite-map'

const SEVERITY_LABELS: Record<string, string> = {
  warning: 'Warning',
  error: 'Error',
  critical: 'Critical',
  outage: 'Outage',
}

const SEVERITY_COLORS: Record<string, string> = {
  warning: 'text-yellow-400',
  error: 'text-red-400',
  critical: 'text-red-500',
  outage: 'text-red-600',
}

const STATUS_LABELS: Record<string, string> = {
  spawned: 'Active',
  in_combat: 'Being Fixed',
  dormant: 'Dormant',
  defeated: 'Resolved',
  escalated: 'Escalated',
}

const STATUS_COLORS: Record<string, string> = {
  spawned: 'text-red-400',
  in_combat: 'text-yellow-400',
  dormant: 'text-gray-400',
  defeated: 'text-green-400',
  escalated: 'text-red-500',
}

const STATUS_BG: Record<string, string> = {
  spawned: 'bg-red-400/10 border-red-400/30',
  in_combat: 'bg-yellow-400/10 border-yellow-400/30',
  dormant: 'bg-gray-400/10 border-gray-400/30',
  defeated: 'bg-green-400/10 border-green-400/30',
  escalated: 'bg-red-500/10 border-red-500/30',
}

/** Estimate time to resolve based on severity */
function estimatedResolution(severity: string): string {
  switch (severity) {
    case 'warning': return '< 5 min'
    case 'error': return '5–15 min'
    case 'critical': return '15–60 min'
    case 'outage': return '1+ hours'
    default: return 'Unknown'
  }
}

/** Format a timestamp as a readable time string */
function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}


export function MonsterPanel() {
  const selectedId = useUIStore((s) => s.selectedEntityId)
  const selectedType = useUIStore((s) => s.selectedEntityType)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const monsters = useMonsterStore((s) => s.monsters)

  if (selectedType !== 'monster' || !selectedId) return null

  const monster = monsters.get(selectedId)
  if (!monster) return null

  // Resolve the sprite region key for this monster's severity
  const spriteKey = entitySprites.resolveEvent('error', monster.severity)

  // Resolve affected building
  const buildings = useUniverseStore.getState().buildings
  const affectedBuilding = monster.affected_building_id
    ? buildings.get(monster.affected_building_id)
    : undefined

  // Resolve fighting agent
  const agents = useAgentStore.getState().agents
  const fightingAgent = monster.fighting_agent_id
    ? agents.get(monster.fighting_agent_id)
    : undefined

  const severityColor = SEVERITY_COLORS[monster.severity] ?? 'text-gray-400'
  const statusColor = STATUS_COLORS[monster.status] ?? 'text-gray-400'
  const statusBg = STATUS_BG[monster.status] ?? 'bg-gray-700/50 border-gray-600/30'

  return (
    <ResizableSidePanel>
      <div className="p-4 flex-1 min-h-0 overflow-y-auto">
        {/* Header — monster sprite + severity title */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2 min-w-0">
            <SpriteIcon region={spriteKey} size={32} className="shrink-0" />
            <h2 className={`font-pixel text-sm ${severityColor} truncate`}>
              {SEVERITY_LABELS[monster.severity] ?? 'Error'}
            </h2>
          </div>
          <button
            onClick={clearSelection}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Status badge */}
        <div className={`rounded border px-3 py-2 mb-4 ${statusBg}`}>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
            Status
          </span>
          <span className={`text-xs font-pixel ${statusColor}`}>
            {STATUS_LABELS[monster.status] ?? monster.status}
          </span>
        </div>

        {/* Error message */}
        <div className="mb-4">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
            Error Message
          </span>
          <p className="text-xs text-gray-300 bg-gray-700/50 rounded px-2.5 py-2 font-mono leading-relaxed break-words">
            {monster.error_details?.message ?? 'Unknown error'}
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700 mb-4" />

        {/* Stats row */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex-1">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Health</span>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full transition-all"
                  style={{ width: `${monster.health}%` }}
                />
              </div>
              <span className="text-xs font-pixel text-gray-200">{monster.health}%</span>
            </div>
          </div>
          <div className="flex-1">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Est. Resolution</span>
            <div className="mt-1">
              <span className="text-xs font-pixel text-gray-200">
                {estimatedResolution(monster.severity)}
              </span>
            </div>
          </div>
        </div>

        {/* Spawned time — timestamp + relative */}
        <div className="mb-4">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Spawned</span>
          <div className="mt-1">
            <span className="text-xs text-gray-300">
              {formatTimestamp(monster.spawned_at)}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700 mb-4" />

        {/* Affected work */}
        {affectedBuilding && (
          <div className="mb-4">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
              Affected Work
            </span>
            <button
              className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer truncate block max-w-full"
              onClick={() => useUIStore.getState().selectEntity(affectedBuilding.id, 'building')}
            >
              <code className="bg-gray-600/50 px-1 rounded">{affectedBuilding.name}</code>
            </button>
          </div>
        )}

        {/* Assigned agent — with sprite and title font */}
        {fightingAgent && (
          <div className="mb-4">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
              Assigned Agent
            </span>
            <button
              className="flex items-center gap-2 cursor-pointer group"
              onClick={() => useUIStore.getState().selectEntity(fightingAgent.id, 'agent')}
            >
              <SpriteIcon region={entitySprites.resolveAgent(fightingAgent.type, fightingAgent.id)} size={24} className="shrink-0" />
              <span className="font-pixel text-xs text-green-400 group-hover:text-green-300">
                {fightingAgent.name}
              </span>
            </button>
          </div>
        )}

        {/* Stack trace (if available) */}
        {monster.error_details?.stack_trace && (
          <>
            <div className="border-t border-gray-700 mb-4" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
                Stack Trace
              </span>
              <pre className="text-[9px] text-gray-400 bg-gray-800/80 rounded px-2.5 py-2 overflow-x-auto max-h-32 font-mono leading-relaxed whitespace-pre-wrap break-all">
                {monster.error_details.stack_trace}
              </pre>
            </div>
          </>
        )}

        {/* Logs (if available) */}
        {monster.error_details?.logs && monster.error_details.logs.length > 0 && (
          <>
            <div className="border-t border-gray-700 mb-4 mt-4" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
                Logs
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {monster.error_details.logs.map((log, i) => (
                  <p key={i} className="text-[9px] text-gray-400 font-mono bg-gray-800/50 rounded px-2 py-1 truncate">
                    {log}
                  </p>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </ResizableSidePanel>
  )
}
