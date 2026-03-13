// ============================================================================
// World Model Store — Event Stream
// Tracks event processing state and dispatches events to other stores.
// Includes world event classification for the Event Log overlay.
// ============================================================================

import { create } from 'zustand'
import type { AgentEvent, WorldCoord } from '@multiverse/shared'
import type { WorkItemType, WorkItemPriority, MonsterSeverity } from '@multiverse/shared'
import { useUniverseStore } from './universeStore'
import { useAgentStore } from './agentStore'
import type { Agent } from '@multiverse/shared'
import { useMonsterStore } from './monsterStore'
import { useWorkItemStore } from './workItemStore'

// ---------------------------------------------------------------------------
// World Event Classification
// ---------------------------------------------------------------------------

export type WorldEventCategory = 'error' | 'deployment' | 'file_change' | 'task' | 'comms' | 'combat'

/** Classify an event into a world event category, or null if agent-only */
export function classifyEvent(event: AgentEvent): WorldEventCategory | null {
  switch (event.type) {
    case 'error_spawn':
      return 'error'
    case 'combat_start':
    case 'combat_end':
      return 'combat'
    case 'file_create':
    case 'file_edit':
    case 'file_delete':
      return 'file_change'
    case 'task_start':
    case 'task_complete':
    case 'workitem_create':
    case 'workitem_update':
      return 'task'
    case 'message_send':
      return 'comms'
    case 'tool_use':
      // Deploy is a world-level event
      if (event.target?.tool_id === 'tool_deploy') return 'deployment'
      // All tool_use events are visible as tasks (file reads, writes, commands, etc.)
      return 'task'
    case 'subagent_spawn':
    case 'subagent_complete':
      return 'task' // Subagent lifecycle is visible as task events
    case 'idle':
    case 'move':
      return null // Agent-only events
    default:
      return null
  }
}

/** Extract a command/detail string for tool_use events (e.g. bash command text) */
export function getToolDetail(event: AgentEvent): string | null {
  if (event.type !== 'tool_use') return null
  const meta = event.metadata as { tool_name?: string; summary?: string; path?: string }
  const toolName = meta.tool_name
  // Bash: show the actual command
  if ((toolName === 'Bash' || toolName === 'bash') && meta.summary) {
    const cmd = meta.summary.replace(/^Bash\s+/i, '').slice(0, 80)
    if (cmd) return `$ ${cmd}`
  }
  // File tools: show the filename
  if (meta.path && (toolName === 'Read' || toolName === 'read' || toolName === 'Write' || toolName === 'write' || toolName === 'Edit' || toolName === 'edit')) {
    const fileName = meta.path.split('/').pop()
    if (fileName) return fileName
  }
  return null
}

/** Human-readable description of an event */
export function describeEvent(event: AgentEvent): string {
  switch (event.type) {
    case 'error_spawn':
      return 'Error encountered'
    case 'combat_start':
      return 'Fighting error'
    case 'combat_end': {
      const outcome = (event.metadata as { outcome?: string })?.outcome
      return outcome === 'defeated' ? 'Error defeated' : 'Error resolved'
    }
    case 'file_create': {
      const path = (event.metadata as { path?: string })?.path
      return path ? `Created ${path.split('/').pop()}` : 'File created'
    }
    case 'file_edit':
      return 'File edited'
    case 'file_delete':
      return 'File deleted'
    case 'task_start': {
      const task = (event.metadata as { task?: string })?.task
      return task ? `Started: ${task}` : 'Task started'
    }
    case 'task_complete':
      return 'Task completed'
    case 'workitem_create': {
      const title = (event.metadata as { title?: string })?.title
      return title ? `New: ${title}` : 'Work item created'
    }
    case 'workitem_update':
      return 'Work item updated'
    case 'message_send':
      return 'Message sent'
    case 'tool_use': {
      const meta = event.metadata as { tool_name?: string; category?: string; action?: string; summary?: string; path?: string }
      const toolName = meta.tool_name

      // Map known tool names to descriptive labels
      if (toolName) {
        const TOOL_LABELS: Record<string, string> = {
          Bash: 'Bash command',
          bash: 'Bash command',
          Read: 'Reading file',
          read: 'Reading file',
          Write: 'Writing file',
          write: 'Writing file',
          Edit: 'Editing file',
          edit: 'Editing file',
          Glob: 'Searching for files',
          glob: 'Searching for files',
          Grep: 'Searching code',
          grep: 'Searching code',
          Task: 'Delegating to sub-agent',
          MultiTool: 'Using multi-tool',
          WebFetch: 'Fetching web content',
          TodoRead: 'Reading task list',
          TodoWrite: 'Writing task list',
          NotebookEdit: 'Editing notebook',
        }
        const label = TOOL_LABELS[toolName]
        if (label) return label
        // Unknown tool — use its name directly
        return `Using ${toolName}`
      }

      // Fallback: check legacy tool_id mapping
      const toolId = event.target?.tool_id
      if (toolId === 'tool_deploy') return 'Deployment triggered'
      if (toolId === 'tool_file_read') return 'Reading file'
      if (toolId === 'tool_code_edit') return 'Editing code'
      if (toolId === 'tool_terminal') return 'Bash command'

      // Reasoning events mapped to tool_use
      if (meta.category === 'reasoning') return 'Thinking...'
      // Progress events (subagent activity)
      if (meta.category === 'progress') return 'Agent working...'

      return 'Using tool'
    }
    case 'subagent_spawn':
      return 'Sub-agent spawned'
    case 'subagent_complete':
      return 'Sub-agent completed'
    case 'move': {
      const buildingId = event.target?.building_id
      if (buildingId) {
        const building = useUniverseStore.getState().buildings.get(buildingId)
        if (building) {
          const segments = building.name.split('/')
          const short = segments[segments.length - 1] ?? building.name
          return `Moving to ${short}`
        }
      }
      return 'Moving'
    }
    case 'idle':
      return 'Agent idle'
    default:
      return (event.type as string).replace(/_/g, ' ')
  }
}

/** Get the error detail message for error/combat events (for display beneath location) */
export function getErrorDetail(event: AgentEvent): string | null {
  if (event.type === 'error_spawn') {
    return (event.metadata as { message?: string })?.message ?? null
  }
  if (event.type === 'combat_start' || event.type === 'combat_end') {
    const monsterId = event.target?.monster_id
    if (monsterId) {
      const monster = useMonsterStore.getState().monsters.get(monsterId)
      return monster?.error_details?.message ?? null
    }
  }
  return null
}

/** Icons for event categories (fallback when no per-type icon matches) */
export const EVENT_CATEGORY_ICONS: Record<WorldEventCategory, string> = {
  error: '⚠️',
  deployment: '🚀',
  file_change: '📝',
  task: '🔧',
  comms: '💬',
  combat: '⚔️',
}

/** Per-event-type icons for more precise visual mapping in the event log */
export const EVENT_TYPE_ICONS: Record<string, string> = {
  move: '🚶',
  tool_use: '🔨',
  file_create: '📄',
  file_edit: '✏️',
  file_delete: '🗑️',
  task_start: '▶️',
  task_complete: '✅',
  error_spawn: '⚠️',
  combat_start: '⚔️',
  combat_end: '🛡️',
  message_send: '💬',
  subagent_spawn: '🤖',
  subagent_complete: '✅',
  workitem_create: '📋',
  workitem_update: '📋',
  idle: '💤',
}

/** Labels for event categories */
export const EVENT_CATEGORY_LABELS: Record<WorldEventCategory, string> = {
  error: 'Errors',
  deployment: 'Deploys',
  file_change: 'Files',
  task: 'Tasks',
  comms: 'Comms',
  combat: 'Combat',
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface EventLog {
  event: AgentEvent
  processedAt: number
}

interface EventState {
  /** Last seen seq per agent */
  agentCursors: Map<string, number>
  /** Set of processed dedupe keys */
  processedKeys: Set<string>
  /** Recent event log (for agent action logs) */
  eventLog: EventLog[]
  /** Max events to keep in log */
  maxLogSize: number
  /** Active world event category filters (all enabled by default) */
  eventFilters: Set<WorldEventCategory>

  // Actions
  processEvent: (event: AgentEvent) => void
  getAgentEvents: (agentId: string, limit?: number) => EventLog[]
  getWorldEvents: () => EventLog[]
  getFilteredWorldEvents: () => EventLog[]
  toggleEventFilter: (category: WorldEventCategory) => void
  reset: () => void
}

export const useEventStore = create<EventState>((set, get) => ({
  agentCursors: new Map(),
  processedKeys: new Set(),
  eventLog: [],
  maxLogSize: 200,
  eventFilters: new Set<WorldEventCategory>([
    'error', 'deployment', 'file_change', 'task', 'comms', 'combat',
  ]),

  processEvent: (event) => {
    const state = get()

    // Dedupe check
    if (state.processedKeys.has(event.dedupe_key)) {
      return
    }

    // Seq check — ensure monotonic per agent
    const currentSeq = state.agentCursors.get(event.agent_id) ?? 0
    if (event.seq <= currentSeq) {
      return // Already processed or out of order
    }

    // Mutate tracking structures in place — no component subscribes to these
    state.processedKeys.add(event.dedupe_key)
    state.agentCursors.set(event.agent_id, event.seq)

    const eventLog = [
      ...state.eventLog.slice(-(state.maxLogSize - 1)),
      { event, processedAt: Date.now() },
    ]

    set({ eventLog })

    // Dispatch to appropriate stores based on event type
    dispatchEvent(event)
  },

  getAgentEvents: (agentId, limit = 20) => {
    return get()
      .eventLog.filter((log) => log.event.agent_id === agentId)
      .slice(-limit)
  },

  getWorldEvents: () => {
    return get().eventLog.filter((log) => classifyEvent(log.event) !== null)
  },

  getFilteredWorldEvents: () => {
    const state = get()
    return state.eventLog.filter((log) => {
      const category = classifyEvent(log.event)
      return category !== null && state.eventFilters.has(category)
    })
  },

  toggleEventFilter: (category) => {
    set((state) => {
      const filters = new Set(state.eventFilters)
      if (filters.has(category)) {
        filters.delete(category)
      } else {
        filters.add(category)
      }
      return { eventFilters: filters }
    })
  },

  reset: () => {
    clearDispatchTimers()
    set({
      agentCursors: new Map(),
      processedKeys: new Set(),
      eventLog: [],
    })
  },
}))

// ---------------------------------------------------------------------------
// Event Dispatch — Routes events to the correct store actions
// ---------------------------------------------------------------------------

/** Per-agent tool_use timer dedup — prevents thousands of pending timers */
const toolTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Per-monster health drain timers for combat_end animation */
const healthDrainTimers = new Map<string, ReturnType<typeof setInterval>>()

/** Per-tile ruins removal timers (delete lifecycle: ruins → removed) */
const tileRuinsTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Per-monster removal timers (defeated → removed from store after fade) */
const monsterRemoveTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Per-monster auto-drain timers for transient error monsters */
const autoDrainTimers = new Map<string, ReturnType<typeof setInterval>>()

/** Current playback speed — scales all dispatch timers so animations match event pacing */
let currentPlaybackSpeed = 1
/**
 * Update dispatch timer scaling for newly created timers.
 *
 * Note: existing timers keep the delay they were created with; speed changes only
 * affect timers scheduled after this is called.
 */
export function setDispatchPlaybackSpeed(speed: number): void {
  currentPlaybackSpeed = Math.max(0.1, speed)
}

/** How long ruins remain visible before tile is removed from store */
const RUINS_FADE_MS = 1500

/** How long after defeat before monster is removed from store (matches renderer fade) */
const MONSTER_REMOVE_DELAY_MS = 600

/** Clear all pending dispatch timers (called on store reset) */
export function clearDispatchTimers(): void {
  for (const timer of toolTimers.values()) {
    clearTimeout(timer)
  }
  toolTimers.clear()
  for (const timer of healthDrainTimers.values()) {
    clearInterval(timer)
  }
  healthDrainTimers.clear()
  for (const timer of tileRuinsTimers.values()) {
    clearTimeout(timer)
  }
  tileRuinsTimers.clear()
  for (const timer of monsterRemoveTimers.values()) {
    clearTimeout(timer)
  }
  monsterRemoveTimers.clear()
  for (const timer of autoDrainTimers.values()) {
    clearInterval(timer)
  }
  autoDrainTimers.clear()
  currentPlaybackSpeed = 1
}

const WORK_ITEM_STATUSES = new Set(['queued', 'active', 'blocked', 'done'])

function isWorkItemStatus(value: string | undefined): value is 'queued' | 'active' | 'blocked' | 'done' {
  return typeof value === 'string' && WORK_ITEM_STATUSES.has(value)
}

function dispatchEvent(event: AgentEvent): void {
  const universe = useUniverseStore.getState()
  const agents = useAgentStore.getState()
  const monsters = useMonsterStore.getState()
  const workItems = useWorkItemStore.getState()

  switch (event.type) {
    // ---- File operations ----
    case 'file_create': {
      const buildingId = event.target?.building_id
      const tileId = event.target?.tile_id
      if (buildingId && tileId) {
        const meta = event.metadata as {
          path?: string
          local?: { x: number; y: number }
        }
        const fileName = meta.path?.split('/').pop() ?? tileId
        const position = meta.local ?? { x: 0, y: 0 }
        universe.addTile(tileId, buildingId, fileName, position, event.agent_id)
      }
      break
    }

    case 'file_edit': {
      const tileId = event.target?.tile_id
      const buildingId = event.target?.building_id
      if (tileId) {
        // Auto-create tile if it doesn't exist yet (resilient to event ordering)
        const existing = universe.tiles.get(tileId)
        if (!existing && buildingId) {
          const meta = event.metadata as { path?: string; local?: { x: number; y: number } }
          const fileName = meta.path?.split('/').pop() ?? tileId
          const position = meta.local ?? { x: 0, y: 0 }
          universe.addTile(tileId, buildingId, fileName, position, event.agent_id)
        }
        // Completion pass events carry state: 'complete' in metadata
        const meta = event.metadata as { state?: string }
        const newState = meta.state === 'complete' ? 'complete' as const : 'building' as const
        universe.updateTile(tileId, { state: newState })
      }
      break
    }

    case 'file_delete': {
      const tileId = event.target?.tile_id
      if (tileId) {
        universe.updateTile(tileId, { state: 'ruins' })
        // Schedule tile removal — ruins briefly visible, then gone (scaled by playback speed)
        const ruinsTimer = setTimeout(() => {
          universe.removeTile(tileId)
          tileRuinsTimers.delete(tileId)
        }, RUINS_FADE_MS / currentPlaybackSpeed)
        tileRuinsTimers.set(tileId, ruinsTimer)
      }
      break
    }

    // ---- Agent movement ----
    case 'move': {
      const buildingId = event.target?.building_id
      if (buildingId) {
        const building = universe.buildings.get(buildingId)
        if (building) {
          // Check if there's an active monster at this building — offset agent to avoid overlap
          let position = building.position
          for (const m of monsters.monsters.values()) {
            if (m.affected_building_id === buildingId && m.status !== 'defeated') {
              position = { ...m.position, local_x: m.position.local_x - 2 }
              break
            }
          }
          agents.batchUpdate((agentMap) => {
            const agent = agentMap.get(event.agent_id)
            if (agent) {
              let finalPosition = position
              const spiralOffsets: Array<[number, number]> = [
                [0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
                [2, 0], [0, 2], [-2, 0], [0, -2],
              ]
              const occupiedPositions = new Set<string>()
              for (const [otherId, other] of agentMap) {
                if (otherId === event.agent_id) continue
                occupiedPositions.add(`${other.position.local_x},${other.position.local_y}`)
              }
              for (const [dx, dy] of spiralOffsets) {
                const testPos = {
                  ...position,
                  local_x: position.local_x + dx,
                  local_y: position.local_y + dy,
                }
                const key = `${testPos.local_x},${testPos.local_y}`
                if (!occupiedPositions.has(key)) {
                  finalPosition = testPos
                  break
                }
              }
              agentMap.set(event.agent_id, { ...agent, position: finalPosition, status: 'active' })
            }
          })
        }
      }
      break
    }

    // ---- Tool use (FX only — no state change) ----
    case 'tool_use': {
      const toolId = event.target?.tool_id
      if (toolId) {
        agents.batchUpdate((agentMap) => {
          const agent = agentMap.get(event.agent_id)
          if (agent) {
            const tools: Agent['tools'] = agent.tools.map((t) =>
              t.tool_id === toolId
                ? { ...t, usage_count: t.usage_count + 1, last_used: Date.now() }
                : t,
            )
            agentMap.set(event.agent_id, { ...agent, active_tool: toolId, tools })
          }
        })
        // Dedup: clear existing timer for this agent before scheduling new one
        const existingTimer = toolTimers.get(event.agent_id)
        if (existingTimer) clearTimeout(existingTimer)
        toolTimers.set(
          event.agent_id,
          setTimeout(() => {
            toolTimers.delete(event.agent_id)
            agents.setActiveTool(event.agent_id, undefined)
          }, 3000 / currentPlaybackSpeed),
        )
      }
      break
    }

    // ---- Subagent lifecycle ----
    case 'subagent_spawn': {
      // Dynamically add a new agent to the agent store when a subagent spawns.
      // This makes the agent visible on the map. The AgentManager will pick it up
      // via store subscription and create its sprite.
      const newAgentId = event.agent_id
      agents.batchUpdate((agentMap) => {
        if (agentMap.has(newAgentId)) return // Already exists
        // Find a building to place the agent near
        const buildingId = event.target?.building_id
        const building = buildingId ? universe.buildings.get(buildingId) : undefined
        const firstBuilding = !building
          ? (universe.buildings.values().next().value as
              | { position: import('@multiverse/shared').WorldCoord }
              | undefined)
          : undefined
        const position =
          building?.position ?? firstBuilding?.position ?? { chunk_x: 0, chunk_y: 0, local_x: 20, local_y: 20 }

        let finalPosition = position
        const spiralOffsets: Array<[number, number]> = [
          [0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
          [2, 0], [0, 2], [-2, 0], [0, -2],
        ]
        const occupiedPositions = new Set<string>()
        for (const existing of agentMap.values()) {
          occupiedPositions.add(`${existing.position.local_x},${existing.position.local_y}`)
        }
        for (const [dx, dy] of spiralOffsets) {
          const testPos = {
            ...position,
            local_x: position.local_x + dx,
            local_y: position.local_y + dy,
          }
          const key = `${testPos.local_x},${testPos.local_y}`
          if (!occupiedPositions.has(key)) {
            finalPosition = testPos
            break
          }
        }

        agentMap.set(newAgentId, {
          id: newAgentId,
          universe_id: 'universe_imported',
          name: `Agent ${newAgentId.slice(-6)}`,
          type: 'claude',
          sprite_config: {
            sprite_sheet: 'agents/claude',
            idle_animation: 'idle',
            walk_animation: 'walk',
            combat_animation: 'combat',
          },
          status: 'active',
          current_planet_id: event.planet_id,
          position: finalPosition,
          vision_radius: 5,
          tools: [
            { tool_id: 'tool_code_edit', enabled: true, usage_count: 0 },
            { tool_id: 'tool_terminal', enabled: true, usage_count: 0 },
            { tool_id: 'tool_file_read', enabled: true, usage_count: 0 },
          ],
        })
      })
      break
    }

    case 'subagent_complete': {
      // Remove the completed agent from the store.
      // AgentManager will detect this via store subscription and destroy the sprite.
      agents.batchUpdate((agentMap) => {
        agentMap.delete(event.agent_id)
      })
      break
    }

    // ---- Task lifecycle ----
    case 'task_start': {
      const workitemId = event.target?.workitem_id
      const meta = event.metadata as { task?: string }
      if (workitemId) {
        agents.batchUpdate((agentMap) => {
          const agent = agentMap.get(event.agent_id)
          if (agent) {
            agentMap.set(event.agent_id, {
              ...agent,
              status: 'active',
              current_task: {
                workitem_id: workitemId,
                title: meta.task ?? 'Working...',
                started_at: event.timestamp,
              },
            })
          }
        })
        workItems.updateWorkItemStatus(workitemId, 'active')
        workItems.assignAgent(workitemId, event.agent_id)
      }
      break
    }

    case 'task_complete': {
      const workitemId = event.target?.workitem_id
      if (workitemId) {
        agents.batchUpdate((agentMap) => {
          const agent = agentMap.get(event.agent_id)
          if (agent) {
            agentMap.set(event.agent_id, {
              ...agent,
              status: 'idle',
              current_task: undefined,
            })
          }
        })
        workItems.updateWorkItemStatus(workitemId, 'done')
      }
      break
    }

    // ---- WorkItem CRUD ----
    // Pipeline metadata uses {category, action, status} where `status` is
    // the event outcome (ok/error), NOT the work item status. Domain fields
    // like `title`, `priority`, `type` are optional extras. For work item
    // status changes, use `status_change` to avoid collision with pipeline
    // `status`.
    case 'workitem_create': {
      const workitemId = event.target?.workitem_id
      const meta = event.metadata as {
        title?: string
        status?: string
        status_change?: string
        priority?: string
        type?: string
      }
      if (workitemId) {
        // status_change takes precedence; fall back to status only if it
        // looks like a WorkItemStatus (not a pipeline ok/error).
        const rawStatus = meta.status_change ?? meta.status
        const wiStatus = isWorkItemStatus(rawStatus) ? rawStatus : 'queued'
        workItems.addWorkItem({
          id: workitemId,
          planetId: event.planet_id,
          type: (meta.type as WorkItemType) ?? 'ticket',
          title: meta.title ?? 'Untitled',
          status: wiStatus,
          priority: meta.priority as WorkItemPriority | undefined,
        })
      }
      break
    }

    case 'workitem_update': {
      const workitemId = event.target?.workitem_id
      const meta = event.metadata as { status?: string; status_change?: string; summary?: string }
      // Prefer status_change (pipeline-safe); fall back to status if it
      // looks like a valid WorkItemStatus.
      const rawStatus = meta.status_change ?? meta.status
      if (workitemId && rawStatus && isWorkItemStatus(rawStatus)) {
        workItems.updateWorkItemStatus(workitemId, rawStatus)
      }
      break
    }

    // ---- Monster / Error ----
    case 'error_spawn': {
      const monsterId = event.target?.monster_id
      const workitemId = event.target?.workitem_id
      const buildingId = event.target?.building_id
      const meta = event.metadata as {
        severity?: string
        message?: string
        tool_name?: string
        trace_id?: string
      }
      if (monsterId) {
        const building = buildingId
          ? universe.buildings.get(buildingId)
          : undefined

        // Deterministic jitter from monster ID to prevent stacking
        let idHash = 0
        for (let i = 0; i < monsterId.length; i++) {
          idHash = ((idHash << 5) - idHash + monsterId.charCodeAt(i)) | 0
        }
        const jitter = Math.abs(idHash) % 3 // 0-2 tiles

        // Resolve position near (but not on top of) the source entity
        let monsterPos: WorldCoord | undefined

        // 1. Prefer agent position — offset +2 tiles in local_x
        const agent = agents.agents.get(event.agent_id)
        if (agent?.position) {
          const offsetX = 2 + jitter
          const rawX = agent.position.local_x + offsetX
          monsterPos = {
            chunk_x: agent.position.chunk_x + (rawX > 63 ? 1 : 0),
            chunk_y: agent.position.chunk_y,
            local_x: rawX > 63 ? rawX - 64 : rawX,
            local_y: agent.position.local_y,
          }
        }

        // 2. Fall back to building position — offset by footprint width + 1
        if (!monsterPos && building?.position) {
          const offsetX = (building.footprint?.width ?? 1) + 1 + jitter
          const rawX = building.position.local_x + offsetX
          monsterPos = {
            chunk_x: building.position.chunk_x + (rawX > 63 ? 1 : 0),
            chunk_y: building.position.chunk_y,
            local_x: rawX > 63 ? rawX - 64 : rawX,
            local_y: building.position.local_y,
          }
        }

        // 3. Fall back to district position with offset
        if (!monsterPos) {
          const districtId = event.target?.district_id
          const district = districtId ? universe.districts.get(districtId) : undefined
          if (district?.position) {
            const offsetX = 2 + jitter
            const rawX = district.position.local_x + offsetX
            monsterPos = {
              chunk_x: district.position.chunk_x + (rawX > 63 ? 1 : 0),
              chunk_y: district.position.chunk_y,
              local_x: rawX > 63 ? rawX - 64 : rawX,
              local_y: district.position.local_y,
            }
          }
        }

        // 4. Last resort: use first building available with offset
        if (!monsterPos) {
          const firstBuilding = universe.buildings.values().next().value as { position: WorldCoord; footprint?: { width: number } } | undefined
          if (firstBuilding?.position) {
            const offsetX = (firstBuilding.footprint?.width ?? 1) + 1 + jitter
            const rawX = firstBuilding.position.local_x + offsetX
            monsterPos = {
              chunk_x: firstBuilding.position.chunk_x + (rawX > 63 ? 1 : 0),
              chunk_y: firstBuilding.position.chunk_y,
              local_x: rawX > 63 ? rawX - 64 : rawX,
              local_y: firstBuilding.position.local_y,
            }
          }
        }
        monsters.spawnMonster({
          id: monsterId,
          planetId: event.planet_id,
          severity: (meta.severity as MonsterSeverity) ?? 'error',
          position: monsterPos ?? {
            chunk_x: 0,
            chunk_y: 0,
            local_x: 0,
            local_y: 0,
          },
          buildingId,
          workitemId,
          message: meta.message ?? 'Unknown error',
          toolName: meta.tool_name,
          spawnedAt: event.timestamp,
        })
        // Auto-drain: health drops from 100→0 over ~3s (scaled by playback speed), then fade out + remove
        const drainMs = 3000 / currentPlaybackSpeed
        const drainSteps = 20
        let adStep = 0
        const autoDrainTimer = setInterval(() => {
          adStep++
          const healthPct = Math.max(0, 100 - (adStep / drainSteps) * 100)
          monsters.updateMonsterHealth(monsterId, healthPct)
          if (adStep >= drainSteps) {
            clearInterval(autoDrainTimer)
            autoDrainTimers.delete(monsterId)
            monsters.defeatMonster(monsterId)
            const removeTimer = setTimeout(() => {
              monsters.removeMonster(monsterId)
              monsterRemoveTimers.delete(monsterId)
            }, MONSTER_REMOVE_DELAY_MS / currentPlaybackSpeed)
            monsterRemoveTimers.set(monsterId, removeTimer)
          }
        }, drainMs / drainSteps)
        autoDrainTimers.set(monsterId, autoDrainTimer)

        // Also create incident workitem
        if (workitemId) {
          workItems.addWorkItem({
            id: workitemId,
            planetId: event.planet_id,
            type: 'incident',
            title: meta.message ?? 'Incident',
            status: 'active',
            priority: 'critical',
          })
        }
      }
      break
    }

    case 'combat_start': {
      const monsterId = event.target?.monster_id
      if (monsterId) {
        // Cancel any auto-drain so incident-grade monsters with explicit combat aren't auto-dismissed
        const pendingAutoDrain = autoDrainTimers.get(monsterId)
        if (pendingAutoDrain) {
          clearInterval(pendingAutoDrain)
          autoDrainTimers.delete(monsterId)
          // Reset health to 100 since combat is taking over
          monsters.updateMonsterHealth(monsterId, 100)
        }
        monsters.updateMonsterStatus(monsterId, 'in_combat')
        monsters.setFightingAgent(monsterId, event.agent_id)
        const monster = monsters.monsters.get(monsterId)
        agents.batchUpdate((agentMap) => {
          const agent = agentMap.get(event.agent_id)
          if (agent) {
            // Move agent next to the monster (offset to the left) so they appear to be fighting
            const position = monster
              ? { ...monster.position, local_x: monster.position.local_x - 2 }
              : agent.position
            agentMap.set(event.agent_id, { ...agent, status: 'combat', position })
          }
        })
      }
      break
    }

    case 'combat_end': {
      const monsterId = event.target?.monster_id
      const meta = event.metadata as { outcome?: string }
      if (monsterId) {
        if (meta.outcome === 'defeated') {
          // Animate health draining before marking defeated (scaled by playback speed)
          const drainSteps = 6
          const drainInterval = 100 / currentPlaybackSpeed
          let step = 0
          const drainTimer = setInterval(() => {
            step++
            const healthPct = Math.max(0, 100 - (step / drainSteps) * 100)
            monsters.updateMonsterHealth(monsterId, healthPct)
            if (step >= drainSteps) {
              clearInterval(drainTimer)
              healthDrainTimers.delete(monsterId)
              monsters.defeatMonster(monsterId)
              // Schedule authoritative removal from store after renderer fade (scaled by playback speed)
              const removeTimer = setTimeout(() => {
                monsters.removeMonster(monsterId)
                monsterRemoveTimers.delete(monsterId)
              }, MONSTER_REMOVE_DELAY_MS / currentPlaybackSpeed)
              monsterRemoveTimers.set(monsterId, removeTimer)
            }
          }, drainInterval)
          healthDrainTimers.set(monsterId, drainTimer)
        } else {
          monsters.updateMonsterStatus(monsterId, 'dormant')
        }
        // Keep agent at current (offset) position — just clear combat status
        agents.batchUpdate((agentMap) => {
          const agent = agentMap.get(event.agent_id)
          if (agent) {
            agentMap.set(event.agent_id, { ...agent, status: 'active' })
          }
        })
      }
      break
    }

    // ---- Comms ----
    case 'message_send': {
      // Comms events are logged but don't change map state directly
      // The speech bubble FX is handled by the render layer
      break
    }

    // ---- Idle ----
    case 'idle': {
      agents.setAgentStatus(event.agent_id, 'idle')
      break
    }

    default:
      break
  }
}
