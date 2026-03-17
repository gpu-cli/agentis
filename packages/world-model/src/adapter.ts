// ============================================================================
// Phase 6: WorldModelSnapshot → ScenarioData adapter
// Pure mechanical mapping — no inference, no heuristics.
// ============================================================================

import type {
  PlanetSnapshot,
  ScenarioData,
  AgentEvent,
  Island,
  District,
  Building,
  Tile,
  Agent,
  SubAgent,
  WorldCoord,
} from '@multiverse/shared'
import type {
  WorldModelSnapshot,
  WMIsland,
  WMDistrict,
  WMBuilding,
  ActorRef,
  CanonicalOperation,
  OperationKind,
} from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple deterministic hash (same as skeleton.ts) */
function djb2(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

/**
 * Generate a deterministic tile ID from a file path and building ID.
 * This ensures the same file always maps to the same tile_id across
 * snapshot construction and event generation.
 */
function deterministicTileId(buildingId: string, filePath: string): string {
  return `tile_${djb2(buildingId + ':' + filePath).toString(16).padStart(8, '0')}`
}

/**
 * Compute the building footprint for a given file count.
 * S: 2x2 (≤2 files), M: 3x2 (≤6), L: 3x3 (≤9), XL: 4x3 (>9)
 */
function computeFootprint(fileCount: number): { width: number; height: number } {
  if (fileCount <= 2) return { width: 2, height: 2 }
  if (fileCount <= 6) return { width: 3, height: 2 }
  if (fileCount <= 9) return { width: 3, height: 3 }
  return { width: 4, height: 3 }
}

// ---------------------------------------------------------------------------
// File Baseline Classification
// ---------------------------------------------------------------------------

export type FileLifecycle = 'preexisting' | 'created_in_session' | 'deleted_in_session'

/**
 * Classify every file path by lifecycle state:
 * - `preexisting`: first operation is a read/edit/search/command (file existed before session)
 * - `created_in_session`: first operation is file_create (file was created during session)
 * - `deleted_in_session`: file was deleted and never recreated
 *
 * When no operations are available (work-unit-only mode), all files are treated as
 * `preexisting` since we can't distinguish — this gives the safest visual baseline.
 */
function classifyFileLifecycles(snapshot: WorldModelSnapshot): Map<string, FileLifecycle> {
  const index = new Map<string, FileLifecycle>()

  if (!snapshot.operations || snapshot.operations.length === 0) {
    // No per-operation data — treat all work unit paths as preexisting
    for (const wu of snapshot.workUnits) {
      for (const path of wu.paths) {
        index.set(path, 'preexisting')
      }
    }
    return index
  }

  // Sort operations by timestamp for correct first-seen detection
  const sorted = [...snapshot.operations]
    .filter(op => op.targetPath !== null)
    .sort((a, b) => a.timestamp - b.timestamp)

  // Track first operation kind per normalized path
  const firstOp = new Map<string, OperationKind>()
  // Track last operation kind per path (for delete detection)
  const lastMutatingOp = new Map<string, OperationKind>()

  for (const op of sorted) {
    if (!op.targetPath) continue
    const normalized = normalizeOpPath(op.targetPath, snapshot)

    if (!firstOp.has(normalized)) {
      firstOp.set(normalized, op.kind)
    }

    // Track last mutating operation
    if (['file_write', 'file_create', 'file_delete'].includes(op.kind)) {
      lastMutatingOp.set(normalized, op.kind)
    }
  }

  // Classify based on first-seen operation
  for (const [path, kind] of firstOp) {
    if (kind === 'file_create') {
      // Check if file was subsequently deleted and never recreated
      if (lastMutatingOp.get(path) === 'file_delete') {
        index.set(path, 'deleted_in_session')
      } else {
        index.set(path, 'created_in_session')
      }
    } else {
      // First operation was read, write (edit), search, command — file pre-existed
      // Unless it was later deleted with no subsequent create
      if (lastMutatingOp.get(path) === 'file_delete') {
        index.set(path, 'deleted_in_session')
      } else {
        index.set(path, 'preexisting')
      }
    }
  }

  // Also classify work unit paths not seen in operations (e.g. from file-history-snapshot)
  for (const wu of snapshot.workUnits) {
    for (const path of wu.paths) {
      if (!index.has(path)) {
        index.set(path, 'preexisting')
      }
    }
  }

  return index
}

/** Ingest diagnostics — surfaced to import UI */
export interface IngestDiagnostics {
  baselineFileCount: number
  createdFileCount: number
  deletedFileCount: number
  synthesizedAtEnd: number
  completionRatio: number // 0–1, fraction of buildings that completed naturally
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function toScenarioData(snapshot: WorldModelSnapshot): ScenarioData {
  const lifecycles = classifyFileLifecycles(snapshot)
  const pathMap = buildPathToBuildingMap(snapshot)

  return {
    name: snapshot.world.name,
    description: `Generated from ${snapshot.layoutMeta.totalObservedFiles} observed files`,
    snapshot: toPlanetSnapshot(snapshot, lifecycles, pathMap),
    events: toAgentEvents(snapshot, lifecycles, pathMap),
  }
}

// ---------------------------------------------------------------------------
// PlanetSnapshot construction
// ---------------------------------------------------------------------------

function toPlanetSnapshot(
  snapshot: WorldModelSnapshot,
  _lifecycles: Map<string, FileLifecycle>,
  _pathMap: Map<string, PathLocation>,
): PlanetSnapshot {
  const islands: Island[] = []
  const districts: District[] = []
  const buildings: Building[] = []
  const tiles: Tile[] = []
  const agents: Agent[] = []
  const subAgents: SubAgent[] = []

  // Track baseline tile counts per building for health/file_count
  const buildingBaselineCounts = new Map<string, number>()

  for (const wmIsland of snapshot.world.islands) {
    islands.push(toIsland(wmIsland, snapshot.world.id))

    for (const wmDistrict of wmIsland.districts) {
      districts.push(toDistrict(wmDistrict, wmIsland))

      for (const wmBuilding of wmDistrict.buildings) {
        // All buildings start empty — tiles appear via events during replay.
        // This ensures buildings visually grow as the agent creates/edits files.
        buildingBaselineCounts.set(wmBuilding.id, 0)
        buildings.push(toBuilding(wmBuilding, wmDistrict, wmIsland, 0))
      }
    }
  }

  // Convert actors — promoted agents render as full Agent entities
  let agentIndex = 0
  for (const actor of snapshot.actors) {
    if (actor.kind === 'human') continue // humans are not rendered as agents

    if (actor.kind === 'subagent') {
      subAgents.push(toSubAgent(actor, snapshot))
    } else {
      agents.push(toAgent(actor, snapshot, agentIndex++))
    }
  }

  // Generate inter-district connections based on adjacency within islands
  const connections = generateDistrictConnections(snapshot)

  return {
    snapshot_version: 1,
    planet_id: snapshot.world.id,
    planet_name: snapshot.world.name,
    generated_at: snapshot.generatedAt,
    agent_cursors: {},
    islands,
    districts,
    buildings,
    tiles,
    agents,
    sub_agents: subAgents,
    monsters: [],
    work_items: [],
    connections,
  }
}

// ---------------------------------------------------------------------------
// District connections (MST-based for road rendering)
// ---------------------------------------------------------------------------

import type { DistrictConnection } from '@multiverse/shared'

/**
 * Generate inter-district connections within each island using MST.
 * This provides the road network for the renderer to draw paths between districts.
 */
function generateDistrictConnections(snapshot: WorldModelSnapshot): DistrictConnection[] {
  const connections: DistrictConnection[] = []
  let connIdx = 0

  for (const island of snapshot.world.islands) {
    const dists = island.districts
    if (dists.length < 2) continue

    // Compute pairwise distances between district centers
    const edges: { i: number; j: number; dist: number }[] = []
    for (let i = 0; i < dists.length; i++) {
      for (let j = i + 1; j < dists.length; j++) {
        const di = dists[i]!
        const dj = dists[j]!
        const cx1 = di.layout.x + di.layout.width / 2
        const cy1 = di.layout.y + di.layout.height / 2
        const cx2 = dj.layout.x + dj.layout.width / 2
        const cy2 = dj.layout.y + dj.layout.height / 2
        const dist = Math.sqrt((cx2 - cx1) ** 2 + (cy2 - cy1) ** 2)
        edges.push({ i, j, dist })
      }
    }

    // Kruskal's MST
    edges.sort((a, b) => a.dist - b.dist)
    const parent = dists.map((_, i) => i)
    const find = (x: number): number => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]! }
      return x
    }

    for (const edge of edges) {
      const ra = find(edge.i)
      const rb = find(edge.j)
      if (ra === rb) continue
      parent[ra] = rb

      connections.push({
        id: `conn_${connIdx++}`,
        from_district_id: dists[edge.i]!.id,
        to_district_id: dists[edge.j]!.id,
        connection_type: 'dependency',
      })

      if (connections.length >= dists.length - 1) break
    }
  }

  return connections
}

// ---------------------------------------------------------------------------
// Entity converters
// ---------------------------------------------------------------------------

function toWorldCoord(x: number, y: number): WorldCoord {
  return {
    chunk_x: 0,
    chunk_y: 0,
    local_x: x,
    local_y: y,
  }
}

function toIsland(wm: WMIsland, planetId: string): Island {
  return {
    id: wm.id,
    planet_id: planetId,
    name: wm.name,
    biome: wm.biome,
    position: toWorldCoord(wm.layout.x, wm.layout.y),
    bounds: { width: wm.layout.width, height: wm.layout.height },
  }
}

function toDistrict(wm: WMDistrict, island: WMIsland): District {
  // District position is relative to island, but in world coords we add island offset
  return {
    id: wm.id,
    island_id: island.id,
    name: wm.name,
    position: toWorldCoord(
      island.layout.x + wm.layout.x,
      island.layout.y + wm.layout.y,
    ),
    bounds: { width: wm.layout.width, height: wm.layout.height },
  }
}

function toBuilding(wm: WMBuilding, district: WMDistrict, island: WMIsland, baselineCount: number = 0): Building {
  const plannedFileCount = wm.workUnitIds.length
  const plannedFootprint = computeFootprint(plannedFileCount)
  const baselineFootprint = computeFootprint(baselineCount)
  // Health is proportional to baseline completion, but ghost buildings are capped at 30
  let health = plannedFileCount > 0 ? Math.round((baselineCount / plannedFileCount) * 100) : 0
  if (wm.materialState === 'ghost') {
    health = Math.min(health, 30)
  }
  return {
    id: wm.id,
    district_id: district.id,
    name: wm.name,
    position: toWorldCoord(
      island.layout.x + district.layout.x + wm.layout.x,
      island.layout.y + district.layout.y + wm.layout.y,
    ),
    // Footprint starts sized for baseline files (grows during replay as new files arrive)
    footprint: baselineCount > 0 ? baselineFootprint : { width: 2, height: 2 },
    // End-state footprint for "planned outline" rendering
    planned_footprint: plannedFootprint,
    // Start with baseline file count — grows as new file_create events fire
    file_count: baselineCount,
    planned_file_count: plannedFileCount,
    health,
    style: wm.sizeBand === 'XL' ? 'tower' : wm.sizeBand === 'L' ? 'large' : 'house',
  }
}

/**
 * Collect unique tool IDs used by a specific actor across all work units.
 * Maps work-unit operation kinds to tool IDs used in the game engine.
 */
function collectUsedTools(actorId: string, snapshot: WorldModelSnapshot): string[] {
  const toolIds = new Set<string>()

  for (const wu of snapshot.workUnits) {
    // Only count units touched by this actor
    if (!wu.stats.actors.includes(actorId)) continue

    if (wu.stats.editCount > 0) toolIds.add('tool_code_edit')
    if (wu.stats.readCount > 0) toolIds.add('tool_file_read')
    if (wu.stats.commandCount > 0) toolIds.add('tool_terminal')
  }

  return [...toolIds]
}

/**
 * Simple hash of a string to a 24-bit color value.
 * Used to give each agent a distinct tint.
 */
function hashColor(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  // Map to pastel-ish colors by keeping values in upper range
  const r = 128 + (Math.abs(hash) % 128)
  const g = 128 + (Math.abs(hash >> 8) % 128)
  const b = 128 + (Math.abs(hash >> 16) % 128)
  return (r << 16) | (g << 8) | b
}

/** Simple seeded hash for deterministic pseudo-random positioning */
function seededRand(seed: number): number {
  let s = seed | 0
  s = ((s + 0x6d2b79f5) | 0)
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Determine the most specific work location for an agent by tracing
 * actor → work units → buildings → districts → islands.
 * Returns absolute (world-space) coordinates.
 */
function findAgentWorkLocation(
  actorId: string,
  snapshot: WorldModelSnapshot,
): { x: number; y: number } | undefined {
  // Collect all work units this actor touched
  const touchedWUs = snapshot.workUnits.filter((wu) => wu.stats.actors.includes(actorId))
  if (touchedWUs.length === 0) return undefined

  const touchedWUIds = new Set(touchedWUs.map((wu) => wu.id))

  // Find all buildings/districts/islands containing those work units
  const buildingSet = new Set<string>()
  const districtSet = new Set<string>()
  const islandSet = new Set<string>()

  interface BuildingLoc {
    island: WMIsland
    district: WMDistrict
    building: WMBuilding
  }
  const buildingLocs: BuildingLoc[] = []

  for (const island of snapshot.world.islands) {
    for (const district of island.districts) {
      for (const building of district.buildings) {
        if (building.workUnitIds.some((id) => touchedWUIds.has(id))) {
          buildingSet.add(building.id)
          districtSet.add(district.id)
          islandSet.add(island.id)
          buildingLocs.push({ island, district, building })
        }
      }
    }
  }

  if (buildingLocs.length === 0) return undefined

  // Most specific: single building → position at that building's center
  if (buildingSet.size === 1) {
    const loc = buildingLocs[0]!
    return {
      x:
        loc.island.layout.x +
        loc.district.layout.x +
        loc.building.layout.x +
        Math.floor(loc.building.layout.width / 2),
      y:
        loc.island.layout.y +
        loc.district.layout.y +
        loc.building.layout.y +
        Math.floor(loc.building.layout.height / 2),
    }
  }

  // Single district → position at district center
  if (districtSet.size === 1) {
    const loc = buildingLocs[0]!
    return {
      x: loc.island.layout.x + loc.district.layout.x + Math.floor(loc.district.layout.width / 2),
      y: loc.island.layout.y + loc.district.layout.y + Math.floor(loc.district.layout.height / 2),
    }
  }

  // Single island → position at island center
  if (islandSet.size === 1) {
    const loc = buildingLocs[0]!
    return {
      x: loc.island.layout.x + Math.floor(loc.island.layout.width / 2),
      y: loc.island.layout.y + Math.floor(loc.island.layout.height / 2),
    }
  }

  // Multiple islands — fallback to first island center
  const firstIsland = snapshot.world.islands[0]
  if (firstIsland) {
    return {
      x: firstIsland.layout.x + Math.floor(firstIsland.layout.width / 2),
      y: firstIsland.layout.y + Math.floor(firstIsland.layout.height / 2),
    }
  }

  return undefined
}

function toAgent(actor: ActorRef, snapshot: WorldModelSnapshot, index: number): Agent {
  // Position agent at their most specific work location
  const workLoc = findAgentWorkLocation(actor.id, snapshot)

  // Add seeded jitter so agents don't stack on the same spot
  const seed = djb2(actor.id + ':pos')
  const jitterX = Math.floor(seededRand(seed) * 3) - 1 // -1, 0, or 1
  const jitterY = Math.floor(seededRand(seed + 9973) * 3) - 1

  const x = workLoc ? workLoc.x + jitterX : 10
  const y = workLoc ? workLoc.y + jitterY : 10

  const agentType = 'claude'

  // Collect unique tools used across all work units for this agent
  const usedToolNames = collectUsedTools(actor.id, snapshot)
  const tools = usedToolNames.map((toolId) => ({
    tool_id: toolId,
    enabled: true,
    usage_count: 0,
  }))

  // Fallback: ensure at least basic tools if none detected
  if (tools.length === 0) {
    tools.push(
      { tool_id: 'tool_code_edit', enabled: true, usage_count: 0 },
      { tool_id: 'tool_terminal', enabled: true, usage_count: 0 },
      { tool_id: 'tool_file_read', enabled: true, usage_count: 0 },
    )
  }

  // Give each non-primary agent a distinct color tint
  const colorTint = index > 0 ? hashColor(actor.id) : undefined

  return {
    id: actor.id,
    universe_id: snapshot.world.id,
    name: actor.name,
    type: agentType,
    sprite_config: {
      sprite_sheet: `agents/${agentType}`,
      idle_animation: 'idle',
      walk_animation: 'walk',
      combat_animation: 'combat',
      ...(colorTint !== undefined ? { color_tint: colorTint } : {}),
    },
    status: 'idle',
    current_planet_id: snapshot.world.id,
    position: toWorldCoord(x, y),
    vision_radius: 8,
    tools,
  }
}

function toSubAgent(actor: ActorRef, snapshot: WorldModelSnapshot): SubAgent {
  const island = snapshot.world.islands[0]
  const x = island ? island.layout.x + Math.floor(island.layout.width / 2) + 2 : 12
  const y = island ? island.layout.y + Math.floor(island.layout.height / 2) + 2 : 12

  return {
    id: actor.id,
    parent_agent_id: actor.parentId ?? 'actor_main',
    name: actor.name,
    type: 'subagent',
    sprite_config: {
      sprite_sheet: 'minions',
      idle_animation: 'idle',
      active_animation: 'active',
    },
    status: 'active',
    position: toWorldCoord(x, y),
    metadata: {},
    created_at: snapshot.generatedAt,
  }
}

// ---------------------------------------------------------------------------
// AgentEvent generation (for replay)
// ---------------------------------------------------------------------------

/** Map operation kind → event type/kind pair */
function opKindToEventType(kind: OperationKind): { eventKind: 'mutation' | 'fx'; eventType: import('@multiverse/shared').AgentEventType; toolId?: string } | null {
  switch (kind) {
    case 'file_write':
      return { eventKind: 'mutation', eventType: 'file_edit' }
    case 'file_create':
      return { eventKind: 'mutation', eventType: 'file_create' }
    case 'file_delete':
      return { eventKind: 'mutation', eventType: 'file_delete' }
    case 'file_read':
      return { eventKind: 'fx', eventType: 'tool_use', toolId: 'tool_file_read' }
    case 'search':
      return { eventKind: 'fx', eventType: 'tool_use', toolId: 'tool_file_read' }
    case 'command_run':
      return { eventKind: 'fx', eventType: 'tool_use', toolId: 'tool_terminal' }
    case 'task_spawn':
      return { eventKind: 'fx', eventType: 'subagent_spawn' }
    case 'task_complete':
      return { eventKind: 'fx', eventType: 'subagent_complete' }
    case 'web_fetch':
      return { eventKind: 'fx', eventType: 'tool_use', toolId: 'tool_terminal' }
    default:
      return null
  }
}

/** Location info for a file path, including its deterministic tile_id */
interface PathLocation {
  buildingId: string
  districtId: string
  islandId: string
  tileId: string
  /** Index of this tile within the building (for positioning) */
  tileIndex: number
  /** Width of the building's planned footprint (for tile grid layout) */
  footprintWidth: number
  /** Short file name (basename) */
  fileName: string
}

/**
 * Build a lookup from file path → building location + tile_id for event targeting.
 */
function buildPathToBuildingMap(snapshot: WorldModelSnapshot): Map<string, PathLocation> {
  const map = new Map<string, PathLocation>()

  for (const island of snapshot.world.islands) {
    for (const district of island.districts) {
      for (const building of district.buildings) {
        // Compute planned footprint width for tile grid layout
        const plannedFileCount = building.workUnitIds.length
        const plannedFootprint = computeFootprint(plannedFileCount)
        let tileIndex = 0
        for (const wuId of building.workUnitIds) {
          const wu = snapshot.workUnits.find(w => w.id === wuId)
          if (!wu) continue
          for (const path of wu.paths) {
            const tileId = deterministicTileId(building.id, path)
            const lastSlash = path.lastIndexOf('/')
            const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
            map.set(path, {
              buildingId: building.id,
              districtId: district.id,
              islandId: island.id,
              tileId,
              tileIndex,
              footprintWidth: plannedFootprint.width,
              fileName,
            })
            tileIndex++
          }
        }
      }
    }
  }

  return map
}

/**
 * Normalize an absolute path by stripping known repo roots.
 * Work units store paths relative to repo root, so we must normalize
 * operation target paths the same way for lookup.
 */
function normalizeOpPath(absPath: string, snapshot: WorldModelSnapshot): string {
  let normalized = absPath.replace(/\\/gu, '/')

  // Try stripping each known repo root
  for (const island of snapshot.world.islands) {
    const root = island.repoRoot.replace(/\\/gu, '/')
    if (normalized.startsWith(root)) {
      normalized = normalized.slice(root.length)
      break
    }
  }

  // Strip leading slash
  if (normalized.startsWith('/')) normalized = normalized.slice(1)
  return normalized
}

/** Maximum number of replay events to generate — prevents OOM on huge transcripts */
const MAX_REPLAY_EVENTS = 5000

/**
 * Generate events from individual operations (per-operation mode for teams transcripts).
 */
function toOperationEvents(
  snapshot: WorldModelSnapshot,
  operations: CanonicalOperation[],
  _lifecycles: Map<string, FileLifecycle>,
  pathMap: Map<string, PathLocation>,
): AgentEvent[] {
  const events: AgentEvent[] = []
  let seq = 0

  // Track last-known building per agent for move events
  const agentLastBuilding = new Map<string, string>()
  // Track which tiles have been created — starts empty so ALL files get
  // file_create events during replay (buildings grow from empty)
  const createdTiles = new Set<string>()

  // Build span lookup for dual-phase event emission (F2.1)
  const spanByOpId = new Map<string, import('./types').ActionSpan>()
  if (snapshot.actionSpans) {
    for (const s of snapshot.actionSpans) {
      spanByOpId.set(s.operationId, s)
    }
  }

  // Filter to actionable operations and sort by timestamp
  const actionableOps = operations
    .filter(op => opKindToEventType(op.kind) !== null || op.targetPath !== null)
    .sort((a, b) => a.timestamp - b.timestamp)

  // Monster spawning is reserved for explicit incident-grade events only.
  // Routine tool failures (is_error on tool_result) are rendered as transient
  // red tool_use FX, not persistent monster/combat entities.

  for (const op of actionableOps) {
    if (events.length >= MAX_REPLAY_EVENTS) break
    const agentId = op.actor.id
    const mapping = opKindToEventType(op.kind)
    if (!mapping) continue

    // F2.1: Look up span for this operation
    const span = spanByOpId.get(op.id)

    // Find building + tile for this operation's target path (normalize to match work-unit paths)
    let target: PathLocation | undefined
    if (op.targetPath) {
      const normalized = normalizeOpPath(op.targetPath, snapshot)
      target = pathMap.get(normalized)
    }

    // Emit move event when agent changes building
    if (target && agentLastBuilding.get(agentId) !== target.buildingId) {
      agentLastBuilding.set(agentId, target.buildingId)
      events.push({
        id: `evt_${seq++}`,
        schema_version: 1,
        dedupe_key: `op:${op.id}:move`,
        agent_id: agentId,
        planet_id: snapshot.world.id,
        seq,
        timestamp: op.timestamp - 1,
        kind: 'fx',
        type: 'move',
        source: 'agent_runtime',
        target: {
          building_id: target.buildingId,
          district_id: target.districtId,
          island_id: target.islandId,
        },
        metadata: {
          local: { x: target.tileIndex % target.footprintWidth, y: Math.floor(target.tileIndex / target.footprintWidth) },
        },
      })
    }

    // F2.1: Span-driven visual beat — emit tool_use at span start for mutations
    if (span && mapping.eventKind === 'mutation' && target) {
      events.push({
        id: `evt_${seq++}`,
        schema_version: 1,
        dedupe_key: `op:${op.id}:span_start`,
        agent_id: agentId,
        planet_id: snapshot.world.id,
        seq,
        timestamp: span.startMs,
        kind: 'fx',
        type: 'tool_use',
        source: 'agent_runtime',
        target: {
          building_id: target.buildingId,
          district_id: target.districtId,
          island_id: target.islandId,
          tool_id: 'tool_code_edit',
        },
        metadata: {
          tool_name: op.toolName ?? 'Edit',
          tool: op.toolName ?? 'Edit',
          local: { x: target.tileIndex % target.footprintWidth, y: Math.floor(target.tileIndex / target.footprintWidth) },
          span_phase: 'start',
        },
      })
    }

    // F1.2: For long-running spans with progress, emit periodic progress pulses
    if (span && span.hasProgress && target) {
      const spanDurationMs = span.endMs - span.startMs
      if (spanDurationMs >= 1000) {
        const PROGRESS_INTERVAL_MS = 500 // pulse every 500ms of replay time
        const pulseCount = Math.min(
          Math.floor(spanDurationMs / PROGRESS_INTERVAL_MS) - 1,
          10, // cap at 10 intermediate pulses
        )

        for (let p = 1; p <= pulseCount; p++) {
          if (events.length >= MAX_REPLAY_EVENTS) break

          const progressTs = span.startMs + p * PROGRESS_INTERVAL_MS
          if (progressTs >= span.endMs) break

          events.push({
            id: `evt_${seq++}`,
            schema_version: 1,
            dedupe_key: `op:${op.id}:progress_${p}`,
            agent_id: agentId,
            planet_id: snapshot.world.id,
            seq,
            timestamp: progressTs,
            kind: 'fx',
            type: 'tool_use',
            source: 'agent_runtime',
            target: {
              building_id: target.buildingId,
              district_id: target.districtId,
              island_id: target.islandId,
              tool_id: 'tool_terminal',
            },
            metadata: {
              tool_name: op.toolName ?? 'Bash',
              tool: op.toolName ?? 'Bash',
              local: { x: target.tileIndex % target.footprintWidth, y: Math.floor(target.tileIndex / target.footprintWidth) },
              span_phase: 'progress',
              progress_index: p,
            },
          })
        }
      }
    }

    // Tool errors spawn a monster. The monster appears with full health, its
    // health bar auto-drains in the event store, and then it fades out.
    // Severity is deterministically varied by hashing the operation ID so
    // different errors get visually distinct monsters across replays.
    if (op.isError) {
      const monsterId = `monster_${op.id}`
      const SEVERITIES = ['warning', 'error', 'error', 'critical'] as const
      let opHash = 0
      for (let c = 0; c < op.id.length; c++) {
        opHash = ((opHash << 5) - opHash + op.id.charCodeAt(c)) | 0
      }
      const severity = SEVERITIES[Math.abs(opHash) % SEVERITIES.length]!
      events.push({
        id: `evt_${seq++}`,
        schema_version: 1,
        dedupe_key: `op:${op.id}:error`,
        agent_id: agentId,
        planet_id: snapshot.world.id,
        seq,
        timestamp: op.timestamp,
        kind: 'mutation',
        type: 'error_spawn',
        source: 'agent_runtime',
        target: {
          monster_id: monsterId,
          ...(target ? {
            building_id: target.buildingId,
            district_id: target.districtId,
            island_id: target.islandId,
          } : {}),
        },
        metadata: {
          severity,
          message: op.summary ?? 'Tool failed',
          tool_name: op.toolName,
        },
      })
      continue
    }

    // For file-targeted mutations: ensure a file_create event precedes any file_edit
    // so that tiles are incrementally added to buildings during replay.
    if (target && (mapping.eventType === 'file_edit' || mapping.eventType === 'file_create')) {
      if (!createdTiles.has(target.tileId)) {
        createdTiles.add(target.tileId)
        // Emit file_create to instantiate the tile
        events.push({
          id: `evt_${seq++}`,
          schema_version: 1,
          dedupe_key: `op:${op.id}:tile_create`,
          agent_id: agentId,
          planet_id: snapshot.world.id,
          seq,
          timestamp: op.timestamp - 0.5, // just before the actual event
          kind: 'mutation',
          type: 'file_create',
          source: 'agent_runtime',
          target: {
            tile_id: target.tileId,
            building_id: target.buildingId,
            district_id: target.districtId,
            island_id: target.islandId,
          },
          metadata: {
            path: op.targetPath ?? target.fileName,
            local: { x: target.tileIndex % target.footprintWidth, y: Math.floor(target.tileIndex / target.footprintWidth) },
          },
        })
      }
    }

    // Emit the operation event (with tile_id when targeting a file)
    // Include local tile coordinates for tile-level FX (F3.2)
    const localCoords = target
      ? { x: target.tileIndex % target.footprintWidth, y: Math.floor(target.tileIndex / target.footprintWidth) }
      : undefined
    events.push({
      id: `evt_${seq++}`,
      schema_version: 1,
      dedupe_key: `op:${op.id}`,
      agent_id: agentId,
      planet_id: snapshot.world.id,
      seq,
      timestamp: (span && mapping.eventKind === 'mutation') ? span.endMs : op.timestamp,
      kind: mapping.eventKind,
      type: mapping.eventType,
      source: 'agent_runtime',
      target: target ? {
        tile_id: target.tileId,
        building_id: target.buildingId,
        district_id: target.districtId,
        island_id: target.islandId,
        ...(mapping.toolId ? { tool_id: mapping.toolId } : {}),
      } : (mapping.toolId ? { tool_id: mapping.toolId } : {}),
      metadata: {
        ...(op.targetPath ? { path: op.targetPath } : {}),
        ...(op.toolName ? { tool_name: op.toolName, tool: op.toolName } : {}),
        ...(op.summary ? { summary: op.summary } : {}),
        ...(localCoords ? { local: localCoords } : {}),
      },
    })
  }

  return events
}

/**
 * Generate events from work-unit summaries (legacy mode for single-agent transcripts).
 * Now emits file_create events with tile_id for incremental building construction.
 */
function toWorkUnitEvents(
  snapshot: WorldModelSnapshot,
  _lifecycles: Map<string, FileLifecycle>,
  pathMap: Map<string, PathLocation>,
): AgentEvent[] {
  const events: AgentEvent[] = []
  let seq = 0
  // Starts empty — all files get file_create events (buildings grow from empty)
  const createdTiles = new Set<string>()

  // Sort work units by last touched time for temporal ordering
  const sortedUnits = [...snapshot.workUnits]
    .filter(wu => wu.stats.lastTouched > 0)
    .sort((a, b) => a.stats.lastTouched - b.stats.lastTouched)

  for (const wu of sortedUnits) {
    // Find the building containing this work unit
    let buildingId: string | undefined
    let districtId: string | undefined
    let islandId: string | undefined

    for (const island of snapshot.world.islands) {
      for (const district of island.districts) {
        for (const building of district.buildings) {
          if (building.workUnitIds.includes(wu.id)) {
            buildingId = building.id
            districtId = district.id
            islandId = island.id
          }
        }
      }
    }

    // Generate events per actor (not just actors[0])
    for (const agentId of wu.stats.actors) {
      // Move agent to target building before file operations
      if (buildingId) {
        events.push({
          id: `evt_${seq++}`,
          schema_version: 1,
          dedupe_key: `wu:${wu.id}:${agentId}:move`,
          agent_id: agentId,
          planet_id: snapshot.world.id,
          seq,
          timestamp: wu.stats.lastTouched - 1, // just before the work event
          kind: 'fx',
          type: 'move',
          source: 'agent_runtime',
          target: {
            building_id: buildingId,
            district_id: districtId,
            island_id: islandId,
          },
          metadata: {},
        })
      }

      // Emit file_create for each path in the work unit (creates tiles incrementally)
      for (const path of wu.paths) {
        const loc = pathMap.get(path)
        if (!loc || createdTiles.has(loc.tileId)) continue
        createdTiles.add(loc.tileId)

        events.push({
          id: `evt_${seq++}`,
          schema_version: 1,
          dedupe_key: `wu:${wu.id}:${agentId}:create:${loc.tileId}`,
          agent_id: agentId,
          planet_id: snapshot.world.id,
          seq,
          timestamp: wu.stats.lastTouched - 0.5,
          kind: 'mutation',
          type: 'file_create',
          source: 'agent_runtime',
          target: {
            tile_id: loc.tileId,
            building_id: loc.buildingId,
            district_id: loc.districtId,
            island_id: loc.islandId,
          },
          metadata: {
            path: path,
            local: { x: loc.tileIndex % loc.footprintWidth, y: Math.floor(loc.tileIndex / loc.footprintWidth) },
          },
        })
      }

      // Emit edit event per significant operation type (with tile_id)
      if (wu.stats.editCount > 0) {
        // Use the first path's tile for the edit event
        const primaryPath = wu.paths[0]
        const primaryLoc = primaryPath ? pathMap.get(primaryPath) : undefined

        events.push({
          id: `evt_${seq++}`,
          schema_version: 1,
          dedupe_key: `wu:${wu.id}:${agentId}:edit`,
          agent_id: agentId,
          planet_id: snapshot.world.id,
          seq,
          timestamp: wu.stats.lastTouched,
          kind: 'mutation',
          type: 'file_edit',
          source: 'agent_runtime',
          target: {
            tile_id: primaryLoc?.tileId,
            building_id: buildingId,
            district_id: districtId,
            island_id: islandId,
          },
          metadata: {
            paths: wu.paths.slice(0, 3),
            editCount: wu.stats.editCount,
          },
        })
      }

      if (wu.stats.readCount > 0) {
        events.push({
          id: `evt_${seq++}`,
          schema_version: 1,
          dedupe_key: `wu:${wu.id}:${agentId}:read`,
          agent_id: agentId,
          planet_id: snapshot.world.id,
          seq,
          timestamp: wu.stats.lastTouched,
          kind: 'fx',
          type: 'tool_use',
          source: 'agent_runtime',
          target: {
            building_id: buildingId,
            district_id: districtId,
            island_id: islandId,
            tool_id: 'tool_file_read',
          },
          metadata: {
            paths: wu.paths.slice(0, 3),
            readCount: wu.stats.readCount,
          },
        })
      }
    }
  }

  return events
}

function toAgentEvents(
  snapshot: WorldModelSnapshot,
  lifecycles: Map<string, FileLifecycle>,
  pathMap: Map<string, PathLocation>,
): AgentEvent[] {
  let events: AgentEvent[]

  // Use per-operation events when operations are available (teams transcripts)
  if (snapshot.operations && snapshot.operations.length > 0) {
    events = toOperationEvents(snapshot, snapshot.operations, lifecycles, pathMap)
  } else {
    // Fall back to work-unit-based events (single-agent transcripts)
    events = toWorkUnitEvents(snapshot, lifecycles, pathMap)
  }

  // --- Completion pass: ensure all planned files exist by end of replay ---
  events = appendCompletionEvents(snapshot, events, lifecycles, pathMap)

  return events
}

/**
 * Append synthetic events at the end of the stream to ensure every building
 * reaches its planned_file_count. This guarantees buildings are fully complete
 * by the time replay finishes.
 *
 * When operations are available (teams transcripts), synthetic events are
 * spread over the last 10% of the replay timeline to avoid a visual burst.
 * Each synthetic tile_create is also preceded by a move event to its building
 * so the agent visually travels to each remaining building.
 */
function appendCompletionEvents(
  snapshot: WorldModelSnapshot,
  events: AgentEvent[],
  lifecycles: Map<string, FileLifecycle>,
  pathMap: Map<string, PathLocation>,
): AgentEvent[] {
  // Determine which tiles were created via events during replay
  const existingTileIds = new Set<string>()
  for (const event of events) {
    if (event.type === 'file_create' && event.target?.tile_id) {
      existingTileIds.add(event.target.tile_id)
    }
  }

  // Collect missing tiles (excluding deleted files)
  const missingTiles: { path: string; loc: PathLocation }[] = []
  for (const [path, loc] of pathMap) {
    if (existingTileIds.has(loc.tileId)) continue
    const lifecycle = lifecycles.get(path)
    if (lifecycle === 'deleted_in_session') continue
    missingTiles.push({ path, loc })
  }

  // Find the replay time range for spreading synthetic events
  const firstTs = events.length > 0 ? events[0]!.timestamp : snapshot.generatedAt
  const lastTs = events.length > 0 ? events[events.length - 1]!.timestamp : snapshot.generatedAt
  const totalDuration = Math.max(lastTs - firstTs, 1000) // at least 1s

  // Spread synthetic tile creations over the last 10% of the timeline
  // with minimum 200ms spacing so they're perceptible during replay
  const spreadStart = lastTs
  const spreadDuration = totalDuration * 0.1
  const stepMs = missingTiles.length > 1
    ? Math.max(200, spreadDuration / missingTiles.length)
    : 200

  // Pick a default agent for synthetic events
  const defaultAgentId = snapshot.actors.find(a => a.kind === 'agent')?.id ?? snapshot.actors[0]?.id ?? 'agent_synthetic'

  let seq = events.length > 0 ? events[events.length - 1]!.seq + 1 : 1
  const synthetic: AgentEvent[] = []

  // Group missing tiles by building so we can emit one move per building
  const tilesByBuilding = new Map<string, { path: string; loc: PathLocation }[]>()
  for (const t of missingTiles) {
    const arr = tilesByBuilding.get(t.loc.buildingId) ?? []
    arr.push(t)
    tilesByBuilding.set(t.loc.buildingId, arr)
  }

  let tileCounter = 0
  for (const [buildingId, tiles] of tilesByBuilding) {
    const first = tiles[0]!
    const moveTs = spreadStart + tileCounter * stepMs

    // Move agent to the building
    synthetic.push({
      id: `evt_synth_move_${seq}`,
      schema_version: 1,
      dedupe_key: `synth:move:${buildingId}`,
      agent_id: defaultAgentId,
      planet_id: snapshot.world.id,
      seq: seq++,
      timestamp: moveTs,
      kind: 'fx',
      type: 'move',
      source: 'synthetic',
      target: {
        building_id: first.loc.buildingId,
        district_id: first.loc.districtId,
        island_id: first.loc.islandId,
      },
      metadata: { synthetic: true },
    })

    // Emit file_create for each tile in this building
    for (const { path, loc } of tiles) {
      const tileTs = spreadStart + tileCounter * stepMs + 50 // 50ms after move
      tileCounter++

      synthetic.push({
        id: `evt_synth_${seq}`,
        schema_version: 1,
        dedupe_key: `synth:complete:${loc.tileId}`,
        agent_id: defaultAgentId,
        planet_id: snapshot.world.id,
        seq: seq++,
        timestamp: tileTs,
        kind: 'mutation',
        type: 'file_create',
        source: 'synthetic',
        target: {
          tile_id: loc.tileId,
          building_id: loc.buildingId,
          district_id: loc.districtId,
          island_id: loc.islandId,
        },
        metadata: {
          path,
          local: { x: loc.tileIndex % loc.footprintWidth, y: Math.floor(loc.tileIndex / loc.footprintWidth) },
          synthetic: true,
        },
      })
    }
  }

  // Emit file_edit to transition all tiles to 'complete' state
  // This happens after all synthetic tiles are created
  const completeTs = spreadStart + tileCounter * stepMs + 100
  for (const [path, loc] of pathMap) {
    const lifecycle = lifecycles.get(path)
    if (lifecycle === 'deleted_in_session') continue

    synthetic.push({
      id: `evt_complete_${seq}`,
      schema_version: 1,
      dedupe_key: `synth:finish:${loc.tileId}`,
      agent_id: defaultAgentId,
      planet_id: snapshot.world.id,
      seq: seq++,
      timestamp: completeTs,
      kind: 'mutation',
      type: 'file_edit',
      source: 'synthetic',
      target: {
        tile_id: loc.tileId,
        building_id: loc.buildingId,
        district_id: loc.districtId,
        island_id: loc.islandId,
      },
      metadata: { state: 'complete', synthetic: true },
    })
  }

  return [...events, ...synthetic]
}
