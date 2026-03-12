// ============================================================================
// Browser-safe projector — UniversalEventsPackage → ScenarioData
// Ported from useScenarioReplay.ts (lines 84-673):
//   buildSnapshotFromReplay, buildAgentEventsFromReplay,
//   projectReplayPackageToScenario, buildBootstrapScenarioFromReplay,
//   and all normalization/fallback helpers
// ============================================================================

import type {
  Agent,
  AgentEvent,
  AgentEventType,
  Building,
  District,
  Island,
  PlanetSnapshot,
  ScenarioData,
  Tile,
  UniversalEvent,
  UniversalEventsPackage,
} from '@multiverse/shared'

// ---------------------------------------------------------------------------
// Layout constants (modelled after the working mock scenarios)
// ---------------------------------------------------------------------------

const ISLAND_PADDING = 5
const DISTRICT_GAP = 2
const BUILDING_GAP = 3
const BUILDING_FOOTPRINT = { width: 2, height: 2 }
const MIN_DISTRICT_SIZE = { width: 10, height: 8 }

const BUILDING_STYLES = ['modern_office', 'server_tower', 'factory', 'library'] as const
const BIOME_OPTIONS = ['urban', 'industrial', 'library', 'observatory'] as const

const AGENT_NAMES = [
  'Nova', 'Forge', 'Iris', 'Atlas', 'Echo', 'Pulse', 'Drift', 'Spark',
  'Flux', 'Onyx', 'Sage', 'Blaze', 'Glitch', 'Cipher', 'Volt', 'Helix',
  'Pixel', 'Quasar', 'Nimbus', 'Prism', 'Hex', 'Orbit', 'Cosmo', 'Warp',
]
const AGENT_TYPES = ['claude', 'cursor', 'codex', 'gemini', 'openclaw'] as const

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function wc(local_x: number, local_y: number, chunk_x = 0, chunk_y = 0) {
  return { chunk_x, chunk_y, local_x, local_y }
}

function simpleHash(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return hash
}

function seededPick<T>(items: readonly T[], seed: number, offset = 0): T {
  const index = Math.abs(((seed >>> 0) + offset * 7919) % items.length)
  return items[index]!
}

// ---------------------------------------------------------------------------
// Universal → AgentEvent type mapping
// ---------------------------------------------------------------------------

function toAgentEventType(event: UniversalEvent): AgentEventType {
  // Subagent lifecycle takes priority — never classify as errors
  if (event.category === 'subagent' && event.action === 'spawn') return 'subagent_spawn'
  if (event.category === 'subagent' && event.action === 'complete') return 'subagent_complete'
  if (event.category === 'subagent') return 'task_start'

  // File changes
  if (event.category === 'file_change') {
    if (event.action === 'create') return 'file_create'
    if (event.action === 'edit') return 'file_edit'
    if (event.action === 'delete') return 'file_delete'
  }

  // Tool calls — error status on a tool call means the tool returned an error,
  // not a system error. Show as tool_use, not error_spawn.
  if (event.category === 'tool_call') return 'tool_use'

  // Conversation
  if (event.category === 'conversation') return 'message_send'

  // Map reasoning to tool_use so it's visible as agent activity (not idle)
  if (event.category === 'reasoning') return 'tool_use'

  // System events are turn boundaries — treat as task completion
  if (event.category === 'system') return 'task_complete'

  // Progress records that made it through without being expanded should map to tool_use
  // (indicates subagent activity)
  if (event.category === 'progress') return 'tool_use'

  // Only genuine system/API errors become error_spawn
  // (events with no recognized category but error status)
  if (event.status === 'error') return 'error_spawn'

  return 'idle'
}

// ---------------------------------------------------------------------------
// Snapshot builder — topology → PlanetSnapshot geometry
// ---------------------------------------------------------------------------

function buildSnapshotFromReplay(input: UniversalEventsPackage): PlanetSnapshot {
  const planetId = input.topology.world.id
  const seed = simpleHash(input.run.id + (input.run.createdAt ?? ''))

  // --- 1. Gather topology metrics ---
  const domainArtifacts = new Map<string, typeof input.topology.artifacts>()
  const domainDistricts = new Map<string, typeof input.topology.districts>()

  for (const domain of input.topology.domains) {
    domainArtifacts.set(domain.id, [])
    domainDistricts.set(domain.id, [])
  }
  for (const district of input.topology.districts) {
    domainDistricts.get(district.domainId)?.push(district)
  }
  for (const artifact of input.topology.artifacts) {
    domainArtifacts.get(artifact.domainId)?.push(artifact)
  }

  // --- 2. Build islands with proper sizing ---
  const islands: Island[] = input.topology.domains.map((domain, domainIndex) => {
    const districts = domainDistricts.get(domain.id) ?? []
    const artifacts = domainArtifacts.get(domain.id) ?? []

    const districtCount = Math.max(1, districts.length)
    const buildingCount = artifacts.filter((a) => a.kind === 'file').length

    const distCols = Math.ceil(Math.sqrt(districtCount))
    const distRows = Math.ceil(districtCount / distCols)

    const maxBuildingsPerDistrict = Math.max(
      4,
      Math.ceil(buildingCount / Math.max(1, districtCount)),
    )
    const bldCols = Math.min(4, Math.ceil(Math.sqrt(maxBuildingsPerDistrict)))
    const bldRows = Math.ceil(maxBuildingsPerDistrict / bldCols)

    const districtWidth = Math.max(MIN_DISTRICT_SIZE.width, bldCols * BUILDING_GAP + 4)
    const districtHeight = Math.max(MIN_DISTRICT_SIZE.height, bldRows * BUILDING_GAP + 4)

    const islandWidth = ISLAND_PADDING * 2 + distCols * districtWidth + (distCols - 1) * DISTRICT_GAP
    const islandHeight = ISLAND_PADDING * 2 + distRows * districtHeight + (distRows - 1) * DISTRICT_GAP

    const islandX = 10 + domainIndex * (islandWidth + 20)
    const islandY = 10

    return {
      id: domain.id,
      planet_id: planetId,
      name: domain.name,
      position: wc(islandX, islandY),
      biome: seededPick(['urban', 'plains'], seed, domainIndex),
      bounds: { width: islandWidth, height: islandHeight },
    }
  })

  // --- 3. Build districts in a grid within each island ---
  const districts: District[] = []
  for (const island of islands) {
    const islandDistricts = input.topology.districts.filter((d) => {
      const domain = input.topology.domains.find((dom) => dom.id === d.domainId)
      return domain && domain.id === island.id
    })

    const distCount = Math.max(1, islandDistricts.length)
    const cols = Math.ceil(Math.sqrt(distCount))

    islandDistricts.forEach((district, distIndex) => {
      const col = distIndex % cols
      const row = Math.floor(distIndex / cols)

      const buildingCount = input.topology.artifacts.filter(
        (a) => a.kind === 'file' && a.districtId === district.id,
      ).length
      const bldCols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(buildingCount))))
      const bldRows = Math.max(2, Math.ceil(buildingCount / bldCols))

      const width = Math.max(MIN_DISTRICT_SIZE.width, bldCols * BUILDING_GAP + 4)
      const height = Math.max(MIN_DISTRICT_SIZE.height, bldRows * BUILDING_GAP + 4)

      const distX = island.position.local_x + ISLAND_PADDING + col * (width + DISTRICT_GAP)
      const distY = island.position.local_y + ISLAND_PADDING + row * (height + DISTRICT_GAP)

      districts.push({
        id: district.id,
        island_id: island.id,
        name: district.name,
        position: wc(distX, distY),
        bounds: { width, height },
        biome_override: seededPick(BIOME_OPTIONS, seed, distIndex + 100),
      })
    })
  }

  // --- 4. Build buildings in a grid within each district ---
  const buildings: Building[] = []
  const tiles: Tile[] = []
  const now = Date.now()

  const artifactsByDistrict = new Map<string, typeof input.topology.artifacts>()
  for (const artifact of input.topology.artifacts) {
    if (artifact.kind !== 'file') continue
    const existing = artifactsByDistrict.get(artifact.districtId) ?? []
    existing.push(artifact)
    artifactsByDistrict.set(artifact.districtId, existing)
  }

  for (const district of districts) {
    const districtArtifacts = artifactsByDistrict.get(district.id) ?? []
    const bldCols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(districtArtifacts.length))))

    districtArtifacts.forEach((artifact, bldIndex) => {
      const col = bldIndex % bldCols
      const row = Math.floor(bldIndex / bldCols)

      const bldX = district.position.local_x + 2 + col * BUILDING_GAP
      const bldY = district.position.local_y + 2 + row * BUILDING_GAP

      const buildingId = artifact.id
      const fileName = artifact.ref.split('/').pop() ?? artifact.ref

      buildings.push({
        id: buildingId,
        district_id: district.id,
        name: fileName.replace(/\.\w+$/u, '') || fileName,
        position: wc(bldX, bldY),
        footprint: BUILDING_FOOTPRINT,
        style: seededPick(BUILDING_STYLES, seed, bldIndex + 200),
        file_count: 1,
        health: 50 + Math.abs(((seed + bldIndex * 37) % 51)),
      })

      tiles.push({
        id: `tile_${buildingId}`,
        building_id: buildingId,
        file_name: fileName,
        position: { x: 0, y: 0 },
        state: 'scaffolding',
        last_modified: now,
      })
    })
  }

  // --- 5. Build agents from actor data ---
  const agents: Agent[] = input.actors
    .filter((actor) => actor.kind === 'agent')
    .map((actor, actorIndex) => {
      const agentType = seededPick(AGENT_TYPES, seed, actorIndex + 300)
      const agentName = seededPick(AGENT_NAMES, seed, actorIndex + 400)

      const targetDistrict = districts[actorIndex % districts.length] ?? districts[0]
      const targetBuilding = buildings.find((b) => b.district_id === targetDistrict?.id) ?? buildings[0]

      // Spiral offset to prevent multiple agents overlapping at the same building
      const spiralOffsets: Array<[number, number]> = [
        [1, 1], [2, 0], [0, 2], [-1, 1], [1, -1], [3, 1], [1, 3], [-1, -1],
      ]
      const offset = spiralOffsets[actorIndex % spiralOffsets.length]!

      const agentX = targetBuilding
        ? targetBuilding.position.local_x + offset[0]
        : (targetDistrict?.position.local_x ?? 20) + 3 + offset[0]
      const agentY = targetBuilding
        ? targetBuilding.position.local_y + offset[1]
        : (targetDistrict?.position.local_y ?? 18) + 3 + offset[1]

      return {
        id: actor.id,
        universe_id: 'universe_imported',
        name: agentName,
        type: agentType,
        sprite_config: {
          sprite_sheet: `agents/${agentType}`,
          idle_animation: 'idle',
          walk_animation: 'walk',
          combat_animation: 'combat',
        },
        status: 'idle' as const,
        current_planet_id: planetId,
        position: wc(agentX, agentY),
        vision_radius: 5,
        tools: [
          { tool_id: 'tool_code_edit', enabled: true, usage_count: 0 },
          { tool_id: 'tool_terminal', enabled: true, usage_count: 0 },
          { tool_id: 'tool_git', enabled: true, usage_count: 0 },
          { tool_id: 'tool_file_read', enabled: true, usage_count: 0 },
        ],
      }
    })

  // Fallback: at least one default agent
  if (agents.length === 0) {
    const agentType = seededPick(AGENT_TYPES, seed, 0)
    const firstBuilding = buildings[0]
    agents.push({
      id: 'actor_main',
      universe_id: 'universe_imported',
      name: seededPick(AGENT_NAMES, seed, 0),
      type: agentType,
      sprite_config: {
        sprite_sheet: `agents/${agentType}`,
        idle_animation: 'idle',
        walk_animation: 'walk',
        combat_animation: 'combat',
      },
      status: 'idle',
      current_planet_id: planetId,
      position: wc(
        firstBuilding ? firstBuilding.position.local_x + 1 : 20,
        firstBuilding ? firstBuilding.position.local_y + 1 : 18,
      ),
      vision_radius: 5,
      tools: [
        { tool_id: 'tool_code_edit', enabled: true, usage_count: 0 },
        { tool_id: 'tool_terminal', enabled: true, usage_count: 0 },
        { tool_id: 'tool_git', enabled: true, usage_count: 0 },
        { tool_id: 'tool_file_read', enabled: true, usage_count: 0 },
      ],
    })
  }

  const agentCursors: Record<string, number> = {}
  for (const agent of agents) {
    agentCursors[agent.id] = 0
  }

  return {
    snapshot_version: 1,
    planet_id: planetId,
    planet_name: input.topology.world.name,
    generated_at: now,
    agent_cursors: agentCursors,
    islands,
    districts,
    buildings,
    tiles,
    agents,
    sub_agents: [],
    monsters: [],
    work_items: [],
    connections: [],
  }
}

// ---------------------------------------------------------------------------
// Event projector — UniversalEvent[] → AgentEvent[]
// ---------------------------------------------------------------------------

function buildAgentEventsFromReplay(input: UniversalEventsPackage): AgentEvent[] {
  const perActorSeq = new Map<string, number>()
  const result: AgentEvent[] = []

  // Track open monsters so we can inject combat_start/combat_end
  let monsterCounter = 0
  const openMonsters: { monsterId: string; agentId: string; buildingId?: string; spawnTimestamp: number }[] = []

  // Track the last building each agent interacted with, so errors that don't
  // directly reference a building can still be placed at a reasonable location.
  const lastBuildingPerAgent = new Map<string, string>()

  // Collect all building IDs from topology for fallback
  const allBuildingIds = input.topology.artifacts
    .filter((a) => a.kind === 'file')
    .map((a) => a.id)

  for (let index = 0; index < input.events.length; index++) {
    const event = input.events[index]!
    const seq = (perActorSeq.get(event.actorId) ?? 0) + 1
    perActorSeq.set(event.actorId, seq)

    const eventType = toAgentEventType(event)
    const timestamp = Date.parse(event.ts) || index
    let buildingId = event.target?.kind === 'artifact' ? event.target.id : undefined

    // Track last known building per agent
    if (buildingId) {
      lastBuildingPerAgent.set(event.actorId, buildingId)
    }

    // For errors without a building, use the agent's last known building or first available
    if (eventType === 'error_spawn' && !buildingId) {
      buildingId = lastBuildingPerAgent.get(event.actorId) ?? allBuildingIds[0]
    }

    const agentEvent: AgentEvent = {
      id: event.id,
      schema_version: 1,
      dedupe_key: event.dedupeKey,
      agent_id: event.actorId,
      planet_id: input.topology.world.id,
      seq,
      timestamp,
      kind: eventType === 'file_create' || eventType === 'file_edit' || eventType === 'file_delete' ? 'mutation' : 'fx',
      type: eventType,
      source: 'agent_runtime',
      target: {
        building_id: buildingId,
        district_id: typeof event.context?.districtId === 'string' ? event.context.districtId : undefined,
        island_id: typeof event.context?.domainId === 'string' ? event.context.domainId : undefined,
        tool_id: event.target?.kind === 'tool' ? event.target.id : undefined,
      },
      metadata: {
        category: event.category,
        action: event.action,
        status: event.status,
        tool_name: event.target?.kind === 'tool' ? (event.target.name ?? undefined) : undefined,
      },
    }

    result.push(agentEvent)

    // When an error_spawn fires, inject a combat_start right after
    if (eventType === 'error_spawn') {
      monsterCounter++
      const monsterId = `monster_synth_${monsterCounter}`

      // Inject monster_id and severity into the error_spawn target/metadata
      agentEvent.target = { ...agentEvent.target, monster_id: monsterId }
      const existingMeta = agentEvent.metadata as Record<string, unknown> | undefined
      agentEvent.metadata = {
        ...existingMeta,
        severity: 'error',
        message: existingMeta?.['action'] ?? 'Error detected',
      }

      openMonsters.push({ monsterId, agentId: event.actorId, buildingId, spawnTimestamp: timestamp })

      // Inject combat_start 500ms after the error
      const combatSeq = (perActorSeq.get(event.actorId) ?? 0) + 1
      perActorSeq.set(event.actorId, combatSeq)
      result.push({
        id: `${event.id}_combat_start`,
        schema_version: 1,
        dedupe_key: `${event.dedupeKey}_combat_start`,
        agent_id: event.actorId,
        planet_id: input.topology.world.id,
        seq: combatSeq,
        timestamp: timestamp + 500,
        kind: 'fx',
        type: 'combat_start',
        source: 'agent_runtime',
        target: { monster_id: monsterId, building_id: buildingId },
        metadata: { category: 'tool_call', action: 'started', status: 'ok' },
      })
    }

    // When a non-error event follows an open monster from the same agent,
    // check if it's a "fix" (file_edit, file_create, tool_use, task_complete)
    // and resolve the monster after a few more events
    for (let mi = openMonsters.length - 1; mi >= 0; mi--) {
      const om = openMonsters[mi]!
      if (om.agentId !== event.actorId) continue
      // Resolve if enough time has passed (3+ seconds after spawn) and we see a constructive action
      const fixTypes = ['file_edit', 'file_create', 'tool_use', 'task_complete']
      if (fixTypes.includes(eventType) && timestamp - om.spawnTimestamp >= 3000) {
        const endSeq = (perActorSeq.get(event.actorId) ?? 0) + 1
        perActorSeq.set(event.actorId, endSeq)
        result.push({
          id: `${event.id}_combat_end_${om.monsterId}`,
          schema_version: 1,
          dedupe_key: `${event.dedupeKey}_combat_end`,
          agent_id: event.actorId,
          planet_id: input.topology.world.id,
          seq: endSeq,
          timestamp: timestamp + 200,
          kind: 'fx',
          type: 'combat_end',
          source: 'agent_runtime',
          target: { monster_id: om.monsterId },
          metadata: { category: 'tool_call', action: 'completed', status: 'ok', outcome: 'defeated' },
        })
        openMonsters.splice(mi, 1)
      }
    }
  }

  // Close any remaining open monsters at the end of the event stream
  for (const om of openMonsters) {
    const lastTimestamp = result.length > 0 ? result[result.length - 1]!.timestamp + 1000 : Date.now()
    const endSeq = (perActorSeq.get(om.agentId) ?? 0) + 1
    perActorSeq.set(om.agentId, endSeq)
    result.push({
      id: `final_combat_end_${om.monsterId}`,
      schema_version: 1,
      dedupe_key: `final_combat_end_${om.monsterId}`,
      agent_id: om.agentId,
      planet_id: input.topology.world.id,
      seq: endSeq,
      timestamp: lastTimestamp,
      kind: 'fx',
      type: 'combat_end',
      source: 'agent_runtime',
      target: { monster_id: om.monsterId },
      metadata: { category: 'tool_call', action: 'completed', status: 'ok', outcome: 'defeated' },
    })
  }

  // Sort by timestamp to maintain chronological order after injections
  result.sort((a, b) => a.timestamp - b.timestamp)

  return result
}

// ---------------------------------------------------------------------------
// Direct projection (no normalization)
// ---------------------------------------------------------------------------

function projectReplayPackageToScenario(input: UniversalEventsPackage): ScenarioData {
  return {
    name: input.run.id,
    description: `Imported replay from ${input.run.source}`,
    snapshot: buildSnapshotFromReplay(input),
    events: buildAgentEventsFromReplay(input),
  }
}

// ---------------------------------------------------------------------------
// Normalization helpers — ensure snapshot is safe for the rendering engine
// ---------------------------------------------------------------------------

function normalizeWorldCoord(coord: { chunk_x: number; chunk_y: number; local_x: number; local_y: number }) {
  if (
    !Number.isFinite(coord.chunk_x) ||
    !Number.isFinite(coord.chunk_y) ||
    !Number.isFinite(coord.local_x) ||
    !Number.isFinite(coord.local_y)
  ) {
    return null
  }
  return {
    chunk_x: Math.floor(coord.chunk_x),
    chunk_y: Math.floor(coord.chunk_y),
    local_x: Math.floor(coord.local_x),
    local_y: Math.floor(coord.local_y),
  }
}

function createFallbackIsland(planetId: string): Island {
  return {
    id: 'island_fallback',
    planet_id: planetId,
    name: 'Imported Replay',
    position: { chunk_x: 0, chunk_y: 0, local_x: 8, local_y: 8 },
    biome: 'urban',
    bounds: { width: 64, height: 48 },
  }
}

function createFallbackDistrict(islandId: string): District {
  return {
    id: 'district_fallback',
    island_id: islandId,
    name: 'General',
    position: { chunk_x: 0, chunk_y: 0, local_x: 14, local_y: 14 },
    bounds: { width: 22, height: 16 },
  }
}

function createFallbackBuilding(districtId: string): Building {
  return {
    id: 'building_fallback',
    district_id: districtId,
    name: 'workspace',
    position: { chunk_x: 0, chunk_y: 0, local_x: 18, local_y: 18 },
    footprint: { width: 2, height: 2 },
    style: 'modern_office',
    file_count: 1,
    health: 100,
  }
}

function createFallbackAgent(agentId: string, planetId: string, anchorBuilding: Building, offset: number): Agent {
  const seed = simpleHash(agentId + planetId)
  const agentType = seededPick(AGENT_TYPES, seed, offset)
  const agentName = seededPick(AGENT_NAMES, seed, offset + 50)

  return {
    id: agentId,
    universe_id: 'universe_imported',
    name: agentName,
    type: agentType,
    sprite_config: {
      sprite_sheet: `agents/${agentType}`,
      idle_animation: 'idle',
      walk_animation: 'walk',
      combat_animation: 'combat',
    },
    status: 'idle',
    current_planet_id: planetId,
    position: {
      ...anchorBuilding.position,
      local_x: anchorBuilding.position.local_x + 1 + (offset % 3),
      local_y: anchorBuilding.position.local_y + 1 + Math.floor(offset / 3),
    },
    vision_radius: 5,
    tools: [
      { tool_id: 'tool_code_edit', enabled: true, usage_count: 0 },
      { tool_id: 'tool_terminal', enabled: true, usage_count: 0 },
    ],
  }
}

function normalizeSnapshotForBootstrap(
  snapshot: PlanetSnapshot,
  events: AgentEvent[],
  warnings: string[],
): PlanetSnapshot {
  // --- Islands ---
  const normalizedIslands: Island[] = []
  for (const island of snapshot.islands) {
    const position = normalizeWorldCoord(island.position)
    if (!position) {
      warnings.push(`dropped island ${island.id}: invalid position`)
      continue
    }
    const width = Math.max(6, Number.isFinite(island.bounds.width) ? Math.floor(island.bounds.width) : 6)
    const height = Math.max(6, Number.isFinite(island.bounds.height) ? Math.floor(island.bounds.height) : 6)
    normalizedIslands.push({ ...island, position, bounds: { width, height } })
  }

  if (normalizedIslands.length === 0) {
    warnings.push('no valid islands found; synthesized fallback island')
    normalizedIslands.push(createFallbackIsland(snapshot.planet_id))
  }

  const islandIds = new Set(normalizedIslands.map((island) => island.id))
  const fallbackIslandId = normalizedIslands[0]!.id

  // --- Districts ---
  const normalizedDistricts: District[] = []
  for (const district of snapshot.districts) {
    const position = normalizeWorldCoord(district.position)
    if (!position) {
      warnings.push(`dropped district ${district.id}: invalid position`)
      continue
    }
    const islandId = islandIds.has(district.island_id) ? district.island_id : fallbackIslandId
    if (islandId !== district.island_id) {
      warnings.push(`district ${district.id} referenced missing island ${district.island_id}; remapped`)
    }
    normalizedDistricts.push({
      ...district,
      island_id: islandId,
      position,
      bounds: {
        width: Math.max(4, Number.isFinite(district.bounds.width) ? Math.floor(district.bounds.width) : 4),
        height: Math.max(4, Number.isFinite(district.bounds.height) ? Math.floor(district.bounds.height) : 4),
      },
    })
  }

  if (normalizedDistricts.length === 0) {
    warnings.push('no valid districts found; synthesized fallback district')
    normalizedDistricts.push(createFallbackDistrict(fallbackIslandId))
  }

  const districtIds = new Set(normalizedDistricts.map((district) => district.id))
  const fallbackDistrictId = normalizedDistricts[0]!.id

  // --- Buildings ---
  const normalizedBuildings: Building[] = []
  for (const building of snapshot.buildings) {
    const position = normalizeWorldCoord(building.position)
    if (!position) {
      warnings.push(`dropped building ${building.id}: invalid position`)
      continue
    }
    const districtId = districtIds.has(building.district_id) ? building.district_id : fallbackDistrictId
    if (districtId !== building.district_id) {
      warnings.push(`building ${building.id} referenced missing district ${building.district_id}; remapped`)
    }
    normalizedBuildings.push({
      ...building,
      district_id: districtId,
      position,
      footprint: {
        width: Math.max(1, Number.isFinite(building.footprint.width) ? Math.floor(building.footprint.width) : 1),
        height: Math.max(1, Number.isFinite(building.footprint.height) ? Math.floor(building.footprint.height) : 1),
      },
      health: Math.max(0, Math.min(100, Number.isFinite(building.health) ? building.health : 100)),
    })
  }

  if (normalizedBuildings.length === 0) {
    warnings.push('no valid buildings found; synthesized fallback building')
    normalizedBuildings.push(createFallbackBuilding(fallbackDistrictId))
  }

  const buildingIds = new Set(normalizedBuildings.map((building) => building.id))

  // --- Tiles ---
  const normalizedTiles: Tile[] = snapshot.tiles
    .filter((tile) => {
      if (!buildingIds.has(tile.building_id)) {
        warnings.push(`dropped tile ${tile.id}: missing building ${tile.building_id}`)
        return false
      }
      return true
    })
    .map((tile) => ({
      ...tile,
      position: {
        x: Number.isFinite(tile.position.x) ? tile.position.x : 0,
        y: Number.isFinite(tile.position.y) ? tile.position.y : 0,
      },
      last_modified: Number.isFinite(tile.last_modified) ? tile.last_modified : Date.now(),
    }))

  // --- Agents: synthesize missing agents referenced by events ---
  const knownAgents = new Set(snapshot.agents.map((agent) => agent.id))
  const eventAgentIds = [...new Set(events.map((event) => event.agent_id))]

  const synthesizedAgents: Agent[] = eventAgentIds
    .filter((agentId) => !knownAgents.has(agentId))
    .map((agentId, index) => {
      warnings.push(`synthesized missing agent ${agentId}`)
      return createFallbackAgent(agentId, snapshot.planet_id, normalizedBuildings[0]!, index)
    })

  return {
    ...snapshot,
    islands: normalizedIslands,
    districts: normalizedDistricts,
    buildings: normalizedBuildings,
    tiles: normalizedTiles,
    agents: [...snapshot.agents, ...synthesizedAgents],
  }
}

function normalizeEventsForSnapshot(
  events: AgentEvent[],
  snapshot: PlanetSnapshot,
  warnings: string[],
): AgentEvent[] {
  const agentIds = new Set(snapshot.agents.map((agent) => agent.id))
  const islandIds = new Set(snapshot.islands.map((island) => island.id))
  const districtIds = new Set(snapshot.districts.map((district) => district.id))
  const buildingIds = new Set(snapshot.buildings.map((building) => building.id))

  return events.flatMap((event) => {
    if (!agentIds.has(event.agent_id)) {
      warnings.push(`dropped event ${event.id}: missing agent ${event.agent_id}`)
      return []
    }

    const normalizedTarget = { ...(event.target ?? {}) }
    if (normalizedTarget.island_id && !islandIds.has(normalizedTarget.island_id)) {
      warnings.push(`event ${event.id}: removed missing island target ${normalizedTarget.island_id}`)
      delete normalizedTarget.island_id
    }
    if (normalizedTarget.district_id && !districtIds.has(normalizedTarget.district_id)) {
      warnings.push(`event ${event.id}: removed missing district target ${normalizedTarget.district_id}`)
      delete normalizedTarget.district_id
    }
    if (normalizedTarget.building_id && !buildingIds.has(normalizedTarget.building_id)) {
      warnings.push(`event ${event.id}: removed missing building target ${normalizedTarget.building_id}`)
      delete normalizedTarget.building_id
    }

    return [{
      ...event,
      target: normalizedTarget,
    }]
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a fully normalized ScenarioData from a UniversalEventsPackage.
 * This is the canonical entry point for the browser ingest pipeline.
 *
 * - Builds snapshot geometry (islands/districts/buildings/agents)
 * - Projects universal events to AgentEvents
 * - Normalizes all positions, references, and synthesizes fallbacks
 *
 * @returns scenario + warnings array for diagnostics
 */
export function buildBootstrapScenario(input: UniversalEventsPackage): {
  scenario: ScenarioData
  warnings: string[]
} {
  const warnings: string[] = []
  const projected = projectReplayPackageToScenario(input)
  const snapshot = normalizeSnapshotForBootstrap(projected.snapshot, projected.events, warnings)
  const events = normalizeEventsForSnapshot(projected.events, snapshot, warnings)

  return {
    scenario: {
      ...projected,
      snapshot,
      events,
    },
    warnings,
  }
}

/**
 * Project a replay package to ScenarioData without normalization.
 * Useful for inspection / debugging but NOT safe for rendering.
 */
export function projectToScenario(input: UniversalEventsPackage): ScenarioData {
  return projectReplayPackageToScenario(input)
}
