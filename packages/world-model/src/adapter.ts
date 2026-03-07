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
  lifecycles: Map<string, FileLifecycle>,
  pathMap: Map<string, PathLocation>,
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
        // Count baseline files for this building
        let baselineCount = 0
        const wmWorkUnits = wmBuilding.workUnitIds
          .map(id => snapshot.workUnits.find(wu => wu.id === id))
          .filter(Boolean)

        for (let i = 0; i < wmWorkUnits.length; i++) {
          const wu = wmWorkUnits[i]!
          for (const path of wu.paths) {
            const lifecycle = lifecycles.get(path)
            if (lifecycle === 'preexisting') {
              // Seed this tile in the snapshot — it existed before the session
              const loc = pathMap.get(path)
              if (loc) {
                tiles.push({
                  id: loc.tileId,
                  building_id: wmBuilding.id,
                  file_name: loc.fileName,
                  position: { x: loc.tileIndex % 3, y: Math.floor(loc.tileIndex / 3) },
                  state: 'building', // Pre-existing files start as built
                  last_modified: wu.stats.lastTouched || snapshot.generatedAt,
                })
                baselineCount++
              }
            }
            // created_in_session files are NOT seeded — they'll appear via events
            // deleted_in_session files are NOT seeded — they appear as ruins via events
          }
        }

        buildingBaselineCounts.set(wmBuilding.id, baselineCount)
        buildings.push(toBuilding(wmBuilding, wmDistrict, wmIsland, baselineCount))
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

function toAgent(actor: ActorRef, snapshot: WorldModelSnapshot, index: number): Agent {
  const island = snapshot.world.islands[0]
  const islandW = island ? island.layout.width : 20
  const islandH = island ? island.layout.height : 20
  const centerX = island ? island.layout.x + Math.floor(islandW / 2) : 10
  const centerY = island ? island.layout.y + Math.floor(islandH / 2) : 10

  // Scatter agents randomly within the island interior using seeded randomness.
  // Bias toward center (50–80% of bounds range) so agents don't spawn on edges.
  const seed = djb2(actor.id + ':pos')
  const rx = seededRand(seed)        // 0–1
  const ry = seededRand(seed + 9973) // 0–1, different seed
  const marginFrac = 0.15 // keep agents out of the outer 15%
  const x = island
    ? island.layout.x + Math.floor(islandW * (marginFrac + rx * (1 - 2 * marginFrac)))
    : centerX
  const y = island
    ? island.layout.y + Math.floor(islandH * (marginFrac + ry * (1 - 2 * marginFrac)))
    : centerY

  // TODO: Make agent type dynamic based on transcript source detection
  // For now hardcode to 'claude' so the sprite renders correctly
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
  lifecycles: Map<string, FileLifecycle>,
  pathMap: Map<string, PathLocation>,
): AgentEvent[] {
  const events: AgentEvent[] = []
  let seq = 0

  // Track last-known building per agent for move events
  const agentLastBuilding = new Map<string, string>()
  // Track which tiles have been created — pre-populate with baseline tiles
  // (they exist in the snapshot, so we don't need to emit file_create for them)
  const createdTiles = new Set<string>()
  for (const [path, lifecycle] of lifecycles) {
    if (lifecycle === 'preexisting') {
      const loc = pathMap.get(path)
      if (loc) createdTiles.add(loc.tileId)
    }
  }

  // Filter to actionable operations and sort by timestamp
  const actionableOps = operations
    .filter(op => opKindToEventType(op.kind) !== null || op.targetPath !== null)
    .sort((a, b) => a.timestamp - b.timestamp)

  // Track open error monsters for combat resolution
  let monsterCounter = 0
  const openMonsters: { monsterId: string; agentId: string; spawnTimestamp: number; buildingId?: string; districtId?: string; islandId?: string }[] = []

  for (const op of actionableOps) {
    if (events.length >= MAX_REPLAY_EVENTS) break
    const agentId = op.actor.id
    const mapping = opKindToEventType(op.kind)
    if (!mapping) continue

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
        metadata: {},
      })
    }

    // Error operations: emit error_spawn + combat_start instead of the normal event
    if (op.isError) {
      monsterCounter++
      const monsterId = `monster_err_${monsterCounter}`
      let buildingId = target?.buildingId ?? agentLastBuilding.get(agentId)

      // If no building found yet, look ahead for the next building this agent touches
      if (!buildingId) {
        for (let fi = actionableOps.indexOf(op) + 1; fi < actionableOps.length; fi++) {
          const futureOp = actionableOps[fi]!
          if (futureOp.actor.id !== agentId || !futureOp.targetPath) continue
          const normalized = normalizeOpPath(futureOp.targetPath, snapshot)
          const futureTarget = pathMap.get(normalized)
          if (futureTarget) { buildingId = futureTarget.buildingId; break }
        }
      }

      // Last resort: use the first building in the snapshot
      if (!buildingId) {
        for (const isl of snapshot.world.islands) {
          for (const dist of isl.districts) {
            if (dist.buildings.length > 0) { buildingId = dist.buildings[0]!.id; break }
          }
          if (buildingId) break
        }
      }

      // Resolve district/island for the error building (may differ from op's target)
      let errorDistrictId = target?.districtId
      let errorIslandId = target?.islandId
      if (buildingId && !errorDistrictId) {
        for (const isl of snapshot.world.islands) {
          for (const dist of isl.districts) {
            for (const bld of dist.buildings) {
              if (bld.id === buildingId) {
                errorDistrictId = dist.id
                errorIslandId = isl.id
              }
            }
          }
        }
      }

      // error_spawn
      events.push({
        id: `evt_${seq++}`,
        schema_version: 1,
        dedupe_key: `op:${op.id}:error`,
        agent_id: agentId,
        planet_id: snapshot.world.id,
        seq,
        timestamp: op.timestamp,
        kind: 'fx',
        type: 'error_spawn',
        source: 'agent_runtime',
        target: {
          monster_id: monsterId,
          building_id: buildingId,
          ...(errorDistrictId ? { district_id: errorDistrictId } : {}),
          ...(errorIslandId ? { island_id: errorIslandId } : {}),
        },
        metadata: {
          severity: 'error',
          message: op.summary ?? op.toolName ?? 'Error detected',
        },
      })

      // combat_start 500ms later
      events.push({
        id: `evt_${seq++}`,
        schema_version: 1,
        dedupe_key: `op:${op.id}:combat_start`,
        agent_id: agentId,
        planet_id: snapshot.world.id,
        seq,
        timestamp: op.timestamp + 500,
        kind: 'fx',
        type: 'combat_start',
        source: 'agent_runtime',
        target: { monster_id: monsterId, building_id: buildingId },
        metadata: {},
      })

      openMonsters.push({ monsterId, agentId, spawnTimestamp: op.timestamp, buildingId, districtId: errorDistrictId, islandId: errorIslandId })
      continue
    }

    // Resolve open monsters when the agent does constructive work 3+ seconds after spawn
    const fixTypes: string[] = ['file_edit', 'file_create', 'tool_use', 'task_complete']
    for (let mi = openMonsters.length - 1; mi >= 0; mi--) {
      const om = openMonsters[mi]!
      if (om.agentId !== agentId) continue
      if (fixTypes.includes(mapping.eventType) && op.timestamp - om.spawnTimestamp >= 3000) {
        events.push({
          id: `evt_${seq++}`,
          schema_version: 1,
          dedupe_key: `op:${op.id}:combat_end_${om.monsterId}`,
          agent_id: agentId,
          planet_id: snapshot.world.id,
          seq,
          timestamp: op.timestamp + 200,
          kind: 'fx',
          type: 'combat_end',
          source: 'agent_runtime',
          target: {
            monster_id: om.monsterId,
            ...(om.buildingId ? { building_id: om.buildingId } : {}),
            ...(om.districtId ? { district_id: om.districtId } : {}),
            ...(om.islandId ? { island_id: om.islandId } : {}),
          },
          metadata: { outcome: 'defeated' },
        })
        openMonsters.splice(mi, 1)
      }
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
            local: { x: target.tileIndex % 3, y: Math.floor(target.tileIndex / 3) },
          },
        })
      }
    }

    // Emit the operation event (with tile_id when targeting a file)
    events.push({
      id: `evt_${seq++}`,
      schema_version: 1,
      dedupe_key: `op:${op.id}`,
      agent_id: agentId,
      planet_id: snapshot.world.id,
      seq,
      timestamp: op.timestamp,
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
      },
    })
  }

  // Close any remaining open monsters at end of stream
  for (const om of openMonsters) {
    const lastTs = events.length > 0 ? events[events.length - 1]!.timestamp + 1000 : Date.now()
    events.push({
      id: `evt_${seq++}`,
      schema_version: 1,
      dedupe_key: `final_combat_end_${om.monsterId}`,
      agent_id: om.agentId,
      planet_id: snapshot.world.id,
      seq,
      timestamp: lastTs,
      kind: 'fx',
      type: 'combat_end',
      source: 'agent_runtime',
      target: {
        monster_id: om.monsterId,
        ...(om.buildingId ? { building_id: om.buildingId } : {}),
        ...(om.districtId ? { district_id: om.districtId } : {}),
        ...(om.islandId ? { island_id: om.islandId } : {}),
      },
      metadata: { outcome: 'defeated' },
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
  lifecycles: Map<string, FileLifecycle>,
  pathMap: Map<string, PathLocation>,
): AgentEvent[] {
  const events: AgentEvent[] = []
  let seq = 0
  // Pre-populate with baseline tiles (preexisting files already in snapshot)
  const createdTiles = new Set<string>()
  for (const [path, lifecycle] of lifecycles) {
    if (lifecycle === 'preexisting') {
      const loc = pathMap.get(path)
      if (loc) createdTiles.add(loc.tileId)
    }
  }

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
            local: { x: loc.tileIndex % 3, y: Math.floor(loc.tileIndex / 3) },
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
 */
function appendCompletionEvents(
  snapshot: WorldModelSnapshot,
  events: AgentEvent[],
  lifecycles: Map<string, FileLifecycle>,
  pathMap: Map<string, PathLocation>,
): AgentEvent[] {
  // Determine which tiles were created (in snapshot baseline or via events)
  const existingTileIds = new Set<string>()

  // Baseline tiles (pre-seeded in snapshot)
  for (const [path, lifecycle] of lifecycles) {
    if (lifecycle === 'preexisting') {
      const loc = pathMap.get(path)
      if (loc) existingTileIds.add(loc.tileId)
    }
  }

  // Tiles created via events
  for (const event of events) {
    if (event.type === 'file_create' && event.target?.tile_id) {
      existingTileIds.add(event.target.tile_id)
    }
  }

  // Find the last event timestamp for offset
  const lastTs = events.length > 0
    ? events[events.length - 1]!.timestamp
    : snapshot.generatedAt

  // Pick a default agent for synthetic events
  const defaultAgentId = snapshot.actors.find(a => a.kind === 'agent')?.id ?? snapshot.actors[0]?.id ?? 'agent_synthetic'

  let seq = events.length > 0 ? events[events.length - 1]!.seq + 1 : 1
  const synthetic: AgentEvent[] = []
  let synthesizedCount = 0

  // Check every file across all buildings
  for (const [path, loc] of pathMap) {
    if (existingTileIds.has(loc.tileId)) continue
    // This file has no tile yet — synthesize creation
    const lifecycle = lifecycles.get(path)
    if (lifecycle === 'deleted_in_session') continue // Don't create tiles for deleted files

    synthesizedCount++
    synthetic.push({
      id: `evt_synth_${seq}`,
      schema_version: 1,
      dedupe_key: `synth:complete:${loc.tileId}`,
      agent_id: defaultAgentId,
      planet_id: snapshot.world.id,
      seq: seq++,
      timestamp: lastTs + synthesizedCount, // stagger by 1ms each
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
        local: { x: loc.tileIndex % 3, y: Math.floor(loc.tileIndex / 3) },
        synthetic: true,
      },
    })
  }

  // Also emit file_edit events to transition all tiles to 'complete' state
  // This happens slightly after all tiles are created
  const completeOffset = synthesizedCount + 1
  for (const [, loc] of pathMap) {
    const lifecycle = lifecycles.get(loc.fileName)
    if (lifecycle === 'deleted_in_session') continue

    synthetic.push({
      id: `evt_complete_${seq}`,
      schema_version: 1,
      dedupe_key: `synth:finish:${loc.tileId}`,
      agent_id: defaultAgentId,
      planet_id: snapshot.world.id,
      seq: seq++,
      timestamp: lastTs + completeOffset,
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
