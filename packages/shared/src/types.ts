// ============================================================================
// Multiverse — Core Entity Types
// From: planning/ui-plans/ui-roadmap.md §7.3 Data Models
// ============================================================================

// ---------------------------------------------------------------------------
// Coordinate Types
// ---------------------------------------------------------------------------

/** Position on a planet surface. All map entities use this. */
export type WorldCoord = {
  chunk_x: number
  chunk_y: number
  local_x: number // 0–63 within chunk
  local_y: number
}

/** Position relative to a parent entity (e.g., tile within a building). */
export type LocalCoord = {
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Identity Types
// ---------------------------------------------------------------------------

export type ExternalRefSource =
  | 'github'
  | 'jira'
  | 'linear'
  | 'slack'
  | 'agent_runtime'
  | 'custom'

export type ExternalRef = {
  source: ExternalRefSource
  source_id: string
}

// ---------------------------------------------------------------------------
// Sprite Config (referenced by Agent/SubAgent)
// ---------------------------------------------------------------------------

export interface SpriteConfig {
  sprite_sheet: string
  idle_animation: string
  walk_animation: string
  combat_animation?: string
  color_tint?: number
}

export interface MinionSpriteConfig {
  sprite_sheet: string
  idle_animation: string
  active_animation: string
  color_tint?: number
}

export interface TaskInfo {
  workitem_id: string
  title: string
  started_at: number
}

// ---------------------------------------------------------------------------
// Map State Entities
// ---------------------------------------------------------------------------

export interface Universe {
  id: string
  org_id: string
  name: string
  config: UniverseConfig
  created_at: number
}

export interface UniverseConfig {
  biome_overrides?: Record<string, unknown>
  theme?: string
  serious_mode?: boolean
  power_user_mode?: boolean
  data_density?: 'minimal' | 'normal' | 'dense'
}

export interface Planet {
  id: string
  universe_id: string
  name: string
  external_ref?: ExternalRef
  world_mode: 'seeded' | 'generated'
  orbit_position: number
  status: 'active' | 'archived' | 'forming'
  created_at: number
}

export interface Island {
  id: string
  planet_id: string
  name: string
  external_ref?: ExternalRef
  position: WorldCoord
  biome: string
  bounds: { width: number; height: number }
}

export interface District {
  id: string
  island_id: string
  name: string
  position: WorldCoord
  bounds: { width: number; height: number }
  biome_override?: string
}

export type ConnectionType = 'api' | 'import' | 'data_flow' | 'event' | 'dependency' | 'general'

export interface DistrictConnection {
  id: string
  from_district_id: string
  to_district_id: string
  connection_type: ConnectionType
  label?: string // e.g. "REST API", "gRPC", "imports"
}

export interface Building {
  id: string
  district_id: string
  name: string
  external_ref?: ExternalRef
  position: WorldCoord
  footprint: { width: number; height: number }
  /** Final footprint computed from planned file count — used for "planned outline" rendering */
  planned_footprint?: { width: number; height: number }
  style: string
  file_count: number
  /** Total files this building will eventually contain (end-state) — drives planned outline */
  planned_file_count?: number
  health: number // 0–100
}

export type TileState = 'scaffolding' | 'building' | 'complete' | 'ruins'

export interface Tile {
  id: string
  building_id: string
  external_ref?: ExternalRef
  file_name: string
  position: LocalCoord
  state: TileState
  last_modified: number
  created_by_agent?: string
}

// ---------------------------------------------------------------------------
// Agent State
// ---------------------------------------------------------------------------

export type AgentStatus = 'active' | 'idle' | 'combat' | 'offline'

export interface Agent {
  id: string
  universe_id: string
  name: string
  type: string // e.g., "engineer", "writer", "researcher", "devops"
  sprite_config: SpriteConfig
  status: AgentStatus
  current_planet_id: string
  position: WorldCoord
  current_task?: TaskInfo
  vision_radius: number
  tools: AgentTool[]
  active_tool?: string
}

export interface AgentTool {
  tool_id: string
  enabled: boolean
  usage_count: number
  last_used?: number
  override_icon?: string
  override_label?: string
}

export type SubAgentStatus = 'active' | 'returning' | 'complete'

export interface SubAgent {
  id: string
  parent_agent_id: string
  name: string
  type: string
  sprite_config: MinionSpriteConfig
  status: SubAgentStatus
  position: WorldCoord
  current_action?: string
  metadata: Record<string, unknown>
  created_at: number
  completed_at?: number
}

// ---------------------------------------------------------------------------
// Monster / Error State
// ---------------------------------------------------------------------------

export type MonsterSeverity = 'warning' | 'error' | 'critical' | 'outage'
export type MonsterTypeName = 'bat' | 'slime' | 'spider' | 'rat'
export type MonsterStatus =
  | 'spawned'
  | 'in_combat'
  | 'dormant'
  | 'defeated'
  | 'escalated'

export interface Monster {
  id: string
  planet_id: string
  workitem_id?: string
  external_ref?: ExternalRef
  severity: MonsterSeverity
  monster_type: MonsterTypeName
  position: WorldCoord
  affected_tiles: string[]
  affected_building_id?: string
  status: MonsterStatus
  health: number // 0–100
  fighting_agent_id?: string
  error_details: {
    message: string
    tool_name?: string
    stack_trace?: string
    logs?: string[]
  }
  conversation_thread: ConversationMessage[]
  spawned_at: number
  resolved_at?: number
}

export interface ConversationMessage {
  id: string
  author: 'agent' | 'sub_agent' | 'user'
  content: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// WorkItem (Quests / Tasks)
// ---------------------------------------------------------------------------

export type WorkItemType =
  | 'ticket'
  | 'objective'
  | 'incident'
  | 'research'
  | 'message_thread'
export type WorkItemStatus = 'queued' | 'active' | 'blocked' | 'done'
export type WorkItemPriority = 'low' | 'medium' | 'high' | 'critical'

export interface WorkItem {
  id: string
  planet_id: string
  type: WorkItemType
  title: string
  description?: string
  status: WorkItemStatus
  priority?: WorkItemPriority
  assigned_agent_id?: string
  external_ref?: ExternalRef
  links: {
    kind: 'github_pr' | 'jira' | 'linear' | 'doc' | 'slack_thread'
    url: string
  }[]
  map_anchor?: {
    island_id?: string
    district_id?: string
    building_id?: string
    position: WorldCoord
  }
  related_entities?: {
    building_ids?: string[]
    tile_ids?: string[]
    agent_ids?: string[]
  }
  created_at: number
  completed_at?: number
}
