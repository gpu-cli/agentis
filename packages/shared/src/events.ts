// ============================================================================
// Multiverse — Event Schema
// From: planning/ui-plans/ui-roadmap.md §7.3 Event Schema
// ============================================================================

import type {
  Island,
  District,
  Building,
  Tile,
  Agent,
  SubAgent,
  Monster,
  WorkItem,
  DistrictConnection,
} from './types'

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export type AgentEventKind = 'mutation' | 'fx'

export type AgentEventType =
  | 'file_create'
  | 'file_edit'
  | 'file_delete'
  | 'message_send'
  | 'task_start'
  | 'task_complete'
  | 'move'
  | 'error_spawn'
  | 'combat_start'
  | 'combat_end'
  | 'idle'
  | 'subagent_spawn'
  | 'subagent_complete'
  | 'tool_use'
  | 'workitem_create'
  | 'workitem_update'

export type AgentEventSource =
  | 'git'
  | 'ticket'
  | 'agent_runtime'
  | 'comms'
  | 'mock'
  | 'synthetic'

/**
 * Dedupe key format by source:
 * - git:       git:<repo>:<commit_sha>:<path>:<op>
 * - ticket:    ticket:<issue_id>:<transition_id>:<ts>
 * - agent_runtime: run:<trace_id>:<span_id>
 * - comms:     comms:<platform>:<message_id>
 * - mock:      mock:<sequence>
 */
export interface AgentEvent {
  id: string
  schema_version: number // start at 1
  dedupe_key: string
  agent_id: string
  planet_id: string
  seq: number // monotonic per agent
  timestamp: number // ms epoch
  kind: AgentEventKind
  type: AgentEventType
  source: AgentEventSource
  target?: {
    tile_id?: string
    building_id?: string
    district_id?: string
    island_id?: string
    monster_id?: string
    tool_id?: string
    workitem_id?: string
  }
  metadata: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// WebSocket Message Envelope
// ---------------------------------------------------------------------------

export type WSMessage =
  | { type: 'event'; event: AgentEvent }
  | { type: 'resync_required' }
  | { type: 'ping'; server_time: number }

// ---------------------------------------------------------------------------
// Planet Snapshot (full state for client sync)
// ---------------------------------------------------------------------------

export interface PlanetSnapshot {
  snapshot_version: number
  planet_id: string
  planet_name?: string
  generated_at: number
  agent_cursors: Record<string, number> // agent_id → last seq included

  // Full world state:
  islands: Island[]
  districts: District[]
  buildings: Building[]
  tiles: Tile[]
  agents: Agent[]
  sub_agents: SubAgent[]
  monsters: Monster[]
  work_items: WorkItem[]
  connections?: DistrictConnection[]
}

// ---------------------------------------------------------------------------
// Scenario container
// ---------------------------------------------------------------------------

export interface ScenarioData {
  name: string
  description: string
  snapshot: PlanetSnapshot
  events: AgentEvent[]
}
