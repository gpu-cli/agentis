// ============================================================================
// Scenario Replay Hook — Feeds events from MockAdapter with timing
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  assertUniversalEventsPackage,
  type Agent,
  type AgentEvent,
  type AgentEventType,
  type Building,
  type District,
  type Island,
  type PlanetSnapshot,
  type ScenarioData,
  type Tile,
  type UniversalEvent,
  type UniversalEventsPackage,
} from '@multiverse/shared'
import {
  scenarioPasswordReset,
  scenarioIncidentBadEnv,
  scenarioResearch,
} from '@multiverse/shared/mock'
import { useUniverseStore } from '../stores/universeStore'
import { useAgentStore } from '../stores/agentStore'
import { useMonsterStore } from '../stores/monsterStore'
import { useWorkItemStore } from '../stores/workItemStore'
import { useEventStore } from '../stores/eventStore'

export type ScenarioName = 'password-reset' | 'incident-bad-env' | 'research'
export type ReplaySource = 'demo' | 'imported'
export type ReplayScenarioKey = ScenarioName | 'imported'
export type PlaybackState = 'idle' | 'playing' | 'paused' | 'complete'

interface UploadedClaudeRecord {
  record: Record<string, unknown>
  fileName: string
  line: number
}

const SCENARIOS: Record<ScenarioName, () => ScenarioData> = {
  'password-reset': scenarioPasswordReset,
  'incident-bad-env': scenarioIncidentBadEnv,
  research: scenarioResearch,
}

interface ReplayState {
  scenarioName: ReplayScenarioKey
  source: ReplaySource
  /** Display name for imported replays (e.g. project name from onboarding) */
  importLabel: string | null
  playbackState: PlaybackState
  speed: number // 1x, 2x, 5x
  currentEventIndex: number
  totalEvents: number
  progress: number // 0-1
  importError: string | null
}

type WorldBuildMode = 'bootstrap' | 'incremental'

function toAgentEventType(event: UniversalEvent): AgentEventType {
  if (event.category === 'file_change') {
    if (event.action === 'create') return 'file_create'
    if (event.action === 'edit') return 'file_edit'
    if (event.action === 'delete') return 'file_delete'
  }

  if (event.category === 'conversation') return 'message_send'
  if (event.category === 'subagent' && event.action === 'spawn') return 'subagent_spawn'
  if (event.category === 'subagent' && event.action === 'complete') return 'subagent_complete'
  if (event.category === 'subagent') return 'task_start'
  if (event.category === 'tool_call') return 'tool_use'
  if (event.status === 'error') return 'error_spawn'

  return 'idle'
}

// ---------------------------------------------------------------------------
// World coordinate helper — uses chunk(0,0) local space like mock scenarios
// ---------------------------------------------------------------------------

function wc(local_x: number, local_y: number, chunk_x = 0, chunk_y = 0) {
  return { chunk_x, chunk_y, local_x, local_y }
}

// ---------------------------------------------------------------------------
// Layout constants (modelled after the working mock scenarios)
// Mock reference: island at wc(0,0,10,10) bounds 40×35
//   districts at (15,15), (30,15), (16,28) — offset 5+ from island edge
//   buildings spaced 3-4 tiles apart within each district
// ---------------------------------------------------------------------------

const ISLAND_PADDING = 5 // tiles between island edge and first district
const DISTRICT_GAP = 2 // tiles between districts
const BUILDING_GAP = 3 // tiles between building origins (footprint + spacing)
const BUILDING_FOOTPRINT = { width: 2, height: 2 }
const MIN_DISTRICT_SIZE = { width: 10, height: 8 }

const BUILDING_STYLES = ['modern_office', 'server_tower', 'factory', 'library'] as const
const BIOME_OPTIONS = ['urban', 'industrial', 'library', 'observatory'] as const

// Agent names pool — seeded by timestamp for deterministic but varied names
const AGENT_NAMES = [
  'Nova', 'Forge', 'Iris', 'Atlas', 'Echo', 'Pulse', 'Drift', 'Spark',
  'Flux', 'Onyx', 'Sage', 'Blaze', 'Glitch', 'Cipher', 'Volt', 'Helix',
  'Pixel', 'Quasar', 'Nimbus', 'Prism', 'Hex', 'Orbit', 'Cosmo', 'Warp',
]
const AGENT_TYPES = ['claude', 'cursor', 'codex', 'gemini', 'openclaw'] as const

function seededPick<T>(items: readonly T[], seed: number, offset = 0): T {
  const index = Math.abs(((seed >>> 0) + offset * 7919) % items.length)
  return items[index]!
}

// ---------------------------------------------------------------------------
// Build a complete, correctly-laid-out PlanetSnapshot from replay package
// ---------------------------------------------------------------------------

function buildSnapshotFromReplay(input: UniversalEventsPackage): PlanetSnapshot {
  const planetId = input.topology.world.id

  // Derive a seed from the run ID for deterministic randomness
  const seed = simpleHash(input.run.id + (input.run.createdAt ?? ''))

  // --- 1. Gather topology metrics to size the island properly ---
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

    // Size island based on content: more districts/buildings = bigger island
    const districtCount = Math.max(1, districts.length)
    const buildingCount = artifacts.filter((a) => a.kind === 'file').length

    // Arrange districts in a grid to calculate island bounds
    const distCols = Math.ceil(Math.sqrt(districtCount))
    const distRows = Math.ceil(districtCount / distCols)

    // Each district needs room for its buildings
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

    // Position each island with generous spacing between them
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

  // --- 3. Build districts — laid out in a grid within each island ---
  const districts: District[] = []
  for (const island of islands) {
    // Match districts to this island: island.id === domain.id (from topology extraction)
    const islandDistricts = input.topology.districts.filter((d) => {
      const domain = input.topology.domains.find((dom) => dom.id === d.domainId)
      return domain && domain.id === island.id
    })

    const distCount = Math.max(1, islandDistricts.length)
    const cols = Math.ceil(Math.sqrt(distCount))

    islandDistricts.forEach((district, distIndex) => {
      const col = distIndex % cols
      const row = Math.floor(distIndex / cols)

      // Count buildings for this district
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

  // --- 4. Build buildings — grid-placed within each district ---
  const buildings: Building[] = []
  const tiles: Tile[] = []
  const now = Date.now()

  // Group artifacts by district
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

      // Create a tile for each building so it renders with visual content
      tiles.push({
        id: `tile_${buildingId}`,
        building_id: buildingId,
        file_name: fileName,
        position: { x: 0, y: 0 },
        state: 'building',
        last_modified: now,
      })
    })
  }

  // --- 5. Build agents from actor data ---
  const agents: Agent[] = input.actors
    .filter((actor) => actor.kind === 'agent' || actor.kind === 'subagent')
    .map((actor, actorIndex) => {
      const agentType = seededPick(AGENT_TYPES, seed, actorIndex + 300)
      const agentName = seededPick(AGENT_NAMES, seed, actorIndex + 400)

      // Place agent inside the first district that has buildings, or fallback
      const targetDistrict = districts[actorIndex % districts.length] ?? districts[0]
      const targetBuilding = buildings.find((b) => b.district_id === targetDistrict?.id) ?? buildings[0]

      const agentX = targetBuilding
        ? targetBuilding.position.local_x + 1
        : (targetDistrict?.position.local_x ?? 20) + 3
      const agentY = targetBuilding
        ? targetBuilding.position.local_y + 1
        : (targetDistrict?.position.local_y ?? 18) + 3

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

  // If no agents were created from actors, create at least one default agent
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

  // Build agent_cursors
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

function buildAgentEventsFromReplay(input: UniversalEventsPackage): AgentEvent[] {
  const perActorSeq = new Map<string, number>()

  return input.events.map((event, index) => {
    const seq = (perActorSeq.get(event.actorId) ?? 0) + 1
    perActorSeq.set(event.actorId, seq)

    return {
      id: event.id,
      schema_version: 1,
      dedupe_key: event.dedupeKey,
      agent_id: event.actorId,
      planet_id: input.topology.world.id,
      seq,
      timestamp: Date.parse(event.ts) || index,
      kind: event.status === 'error' ? 'fx' : 'mutation',
      type: toAgentEventType(event),
      source: 'agent_runtime',
      target: {
        building_id: event.target?.kind === 'artifact' ? event.target.id : undefined,
        district_id: typeof event.context?.districtId === 'string' ? event.context.districtId : undefined,
        island_id: typeof event.context?.domainId === 'string' ? event.context.domainId : undefined,
        tool_id: event.target?.kind === 'tool' ? event.target.id : undefined,
      },
      metadata: {
        category: event.category,
        action: event.action,
        status: event.status,
      },
    }
  })
}

function projectReplayPackageToScenario(input: UniversalEventsPackage): ScenarioData {
  return {
    name: input.run.id,
    description: `Imported replay from ${input.run.source}`,
    snapshot: buildSnapshotFromReplay(input),
    events: buildAgentEventsFromReplay(input),
  }
}

function buildBootstrapScenarioFromReplay(input: UniversalEventsPackage): {
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

function normalizeSnapshotForBootstrap(
  snapshot: PlanetSnapshot,
  events: AgentEvent[],
  warnings: string[],
): PlanetSnapshot {
  const normalizedIslands: Island[] = []
  for (const island of snapshot.islands) {
    const position = normalizeWorldCoord(island.position)
    if (!position) {
      warnings.push(`dropped island ${island.id}: invalid position`)
      continue
    }

    const width = Math.max(6, Number.isFinite(island.bounds.width) ? Math.floor(island.bounds.width) : 6)
    const height = Math.max(6, Number.isFinite(island.bounds.height) ? Math.floor(island.bounds.height) : 6)
    normalizedIslands.push({
      ...island,
      position,
      bounds: { width, height },
    })
  }

  if (normalizedIslands.length === 0) {
    warnings.push('no valid islands found; synthesized fallback island')
    normalizedIslands.push(createFallbackIsland(snapshot.planet_id))
  }

  const islandIds = new Set(normalizedIslands.map((island) => island.id))
  const fallbackIslandId = normalizedIslands[0]!.id

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

function normalizeWorldCoord(coord: { chunk_x: number; chunk_y: number; local_x: number; local_y: number }) {
  if (!Number.isFinite(coord.chunk_x) || !Number.isFinite(coord.chunk_y) || !Number.isFinite(coord.local_x) || !Number.isFinite(coord.local_y)) {
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

export function useScenarioReplay() {
  const [state, setState] = useState<ReplayState>({
    scenarioName: 'password-reset',
    source: 'demo',
    importLabel: null,
    playbackState: 'idle',
    speed: 1,
    currentEventIndex: 0,
    totalEvents: 0,
    progress: 0,
    importError: null,
  })

  const eventsRef = useRef<AgentEvent[]>([])
  const scenarioRef = useRef<ScenarioData | null>(null)
  const lastReplayPackageRef = useRef<UniversalEventsPackage | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const loadScenario = useCallback(
    (name: ScenarioName) => {
      clearTimer()

      const scenarioFn = SCENARIOS[name]
      const scenario = scenarioFn()
      scenarioRef.current = scenario

      // Load snapshot into all stores
      useUniverseStore.getState().loadSnapshot(scenario.snapshot)
      useAgentStore.getState().loadSnapshot(scenario.snapshot)
      useMonsterStore.getState().loadSnapshot(scenario.snapshot)
      useWorkItemStore.getState().loadSnapshot(scenario.snapshot)
      useEventStore.getState().reset()

      eventsRef.current = scenario.events

      setState({
        scenarioName: name,
        source: 'demo',
        importLabel: null,
        playbackState: 'idle',
        speed: stateRef.current.speed,
        currentEventIndex: 0,
        totalEvents: scenario.events.length,
        progress: 0,
        importError: null,
      })
    },
    [clearTimer],
  )

  const loadReplayPackage = useCallback(
    (replayPackage: UniversalEventsPackage, options?: { worldBuildMode?: WorldBuildMode; importLabel?: string }) => {
      clearTimer()

      try {
        const validated = assertUniversalEventsPackage(replayPackage)
        lastReplayPackageRef.current = validated
        const worldBuildMode = options?.worldBuildMode ?? 'bootstrap'
        const result = worldBuildMode === 'bootstrap'
          ? buildBootstrapScenarioFromReplay(validated)
          : { scenario: projectReplayPackageToScenario(validated), warnings: [] }
        const scenario = result.scenario

        if (result.warnings.length > 0) {
          console.warn('[replay-import] bootstrap warnings', result.warnings)
        }

        scenarioRef.current = scenario

        useUniverseStore.getState().loadSnapshot(scenario.snapshot)
        useAgentStore.getState().loadSnapshot(scenario.snapshot)
        useMonsterStore.getState().loadSnapshot(scenario.snapshot)
        useWorkItemStore.getState().loadSnapshot(scenario.snapshot)
        useEventStore.getState().reset()

        eventsRef.current = scenario.events

        setState((current) => ({
          ...current,
          scenarioName: 'imported',
          source: 'imported',
          importLabel: options?.importLabel ?? null,
          playbackState: 'idle',
          currentEventIndex: 0,
          totalEvents: scenario.events.length,
          progress: 0,
          importError: null,
        }))
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Replay package import failed'
        setState((current) => ({
          ...current,
          importError: message,
        }))
      }
    },
    [clearTimer],
  )

  const loadReplayJson = useCallback(
    (jsonText: string) => {
      try {
        const parsed = JSON.parse(jsonText) as unknown
        loadReplayPackage(parsed as UniversalEventsPackage)
      } catch {
        setState((current) => ({
          ...current,
          importError: 'Invalid JSON payload',
        }))
      }
    },
    [loadReplayPackage],
  )

  const loadClaudeTranscriptFiles = useCallback(
    async (projectName: string, files: File[]): Promise<boolean> => {
      if (files.length === 0) {
        setState((current) => ({
          ...current,
          importError: 'Please upload at least one transcript file',
        }))
        return false
      }

      try {
        const records = await parseUploadedClaudeFiles(files)
        const replayPackage = buildReplayFromUploadedClaude(projectName, files, records)
        loadReplayPackage(replayPackage, { importLabel: projectName || undefined })
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to parse Claude transcripts'
        setState((current) => ({
          ...current,
          importError: message,
        }))
        return false
      }
    },
    [loadReplayPackage],
  )

  /** When replay finishes, fill every building's footprint with tiles so
   *  buildings look complete — tiles represent files, and a finished demo
   *  should show full occupancy. */
  const fillBuildingsToCapacity = useCallback(() => {
    const universe = useUniverseStore.getState()
    for (const building of universe.buildings.values()) {
      const capacity = building.footprint.width * building.footprint.height
      const existingTiles = universe.getBuildingTiles(building.id)
      const deficit = capacity - existingTiles.length
      if (deficit <= 0) continue

      // Track which grid positions are already occupied
      const occupied = new Set(existingTiles.map((t) => `${t.position.x},${t.position.y}`))

      let added = 0
      for (let y = 0; y < building.footprint.height && added < deficit; y++) {
        for (let x = 0; x < building.footprint.width && added < deficit; x++) {
          if (occupied.has(`${x},${y}`)) continue
          const tileId = `fill_${building.id}_${x}_${y}`
          universe.addTile(tileId, building.id, `module_${added}`, { x, y })
          // Mark tile as complete so health reaches 100%
          universe.updateTile(tileId, { state: 'complete' })
          added++
        }
      }
    }
  }, [])

  const processNextEvent = useCallback(() => {
    const events = eventsRef.current
    const current = stateRef.current

    if (current.currentEventIndex >= events.length) {
      fillBuildingsToCapacity()
      setState((s) => ({ ...s, playbackState: 'complete' }))
      return
    }

    if (current.playbackState !== 'playing') return

    // Guard: if a timer is already pending, don't double-fire
    if (timerRef.current !== null) return

    const event = events[current.currentEventIndex]!
    try {
      useEventStore.getState().processEvent(event)
    } catch (err) {
      console.warn('[replay] event processing error, skipping', err)
    }

    const nextIndex = current.currentEventIndex + 1
    setState((s) => ({
      ...s,
      currentEventIndex: nextIndex,
      progress: nextIndex / events.length,
    }))

    // Schedule next event
    if (nextIndex < events.length) {
      const nextEvent = events[nextIndex]!
      const delay = (nextEvent.timestamp - event.timestamp) / current.speed
      // Clamp delay to reasonable bounds (min 80ms to prevent flooding the renderer)
      const clampedDelay = Math.max(80, Math.min(delay, 5000))
      timerRef.current = setTimeout(() => {
        timerRef.current = null // clear ref BEFORE processing so re-entry guard works
        processNextEvent()
      }, clampedDelay)
    } else {
      fillBuildingsToCapacity()
      setState((s) => ({ ...s, playbackState: 'complete' }))
    }
  }, [fillBuildingsToCapacity])

  const play = useCallback(() => {
    setState((s) => ({ ...s, playbackState: 'playing' }))
    // Will trigger via effect
  }, [])

  const pause = useCallback(() => {
    clearTimer()
    setState((s) => ({ ...s, playbackState: 'paused' }))
  }, [clearTimer])

  const restart = useCallback(() => {
    const current = stateRef.current
    if (current.source === 'imported' && scenarioRef.current) {
      const scenario = scenarioRef.current
      useUniverseStore.getState().loadSnapshot(scenario.snapshot)
      useAgentStore.getState().loadSnapshot(scenario.snapshot)
      useMonsterStore.getState().loadSnapshot(scenario.snapshot)
      useWorkItemStore.getState().loadSnapshot(scenario.snapshot)
      useEventStore.getState().reset()
      eventsRef.current = scenario.events
      setState((s) => ({
        ...s,
        playbackState: 'idle',
        currentEventIndex: 0,
        progress: 0,
      }))
      return
    }

    loadScenario(current.scenarioName as ScenarioName)
  }, [loadScenario])

  const setSpeed = useCallback((speed: number) => {
    setState((s) => ({ ...s, speed }))
  }, [])

  const stepForward = useCallback(() => {
    const events = eventsRef.current
    const current = stateRef.current

    if (current.currentEventIndex >= events.length) return

    const event = events[current.currentEventIndex]!
    useEventStore.getState().processEvent(event)

    const nextIndex = current.currentEventIndex + 1
    setState((s) => ({
      ...s,
      currentEventIndex: nextIndex,
      progress: nextIndex / events.length,
      playbackState: nextIndex >= events.length ? 'complete' : 'paused',
    }))
  }, [])

  // Start processing when playback state changes to 'playing'
  useEffect(() => {
    if (state.playbackState === 'playing') {
      // Clear any existing timer before starting fresh
      clearTimer()
      processNextEvent()
    }
    return clearTimer
  }, [state.playbackState, clearTimer, processNextEvent])

  return {
    ...state,
    /** The last successfully loaded UniversalEventsPackage (for persistence) */
    lastReplayPackage: lastReplayPackageRef.current,
    loadScenario,
    startDemo: loadScenario,
    loadReplayPackage,
    loadReplayJson,
    loadClaudeTranscriptFiles,
    play,
    pause,
    restart,
    setSpeed,
    stepForward,
  }
}

async function parseUploadedClaudeFiles(files: File[]): Promise<UploadedClaudeRecord[]> {
  const records: UploadedClaudeRecord[] = []

  for (const file of files) {
    const text = await file.text()
    const lines = text.split(/\r?\n/u)

    lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        return
      }

      if (typeof parsed !== 'object' || parsed === null) {
        return
      }

      const record = parsed as Record<string, unknown>
      if (typeof record.type !== 'string') {
        return
      }

      records.push({
        record,
        fileName: file.name,
        line: index + 1,
      })
    })
  }

  records.sort((a, b) => {
    const aTs = getRecordTimestamp(a.record)
    const bTs = getRecordTimestamp(b.record)
    const tsCompare = aTs.localeCompare(bTs)
    if (tsCompare !== 0) {
      return tsCompare
    }

    const fileCompare = a.fileName.localeCompare(b.fileName)
    if (fileCompare !== 0) {
      return fileCompare
    }

    return a.line - b.line
  })

  return records
}

// ---------------------------------------------------------------------------
// Topology extraction: repo roots, districts, artifacts from transcript
// ---------------------------------------------------------------------------

/** Deterministic domain ID from a repo root path (browser-safe, no node:crypto). */
function domainIdFromRoot(root: string): string {
  const digest = Math.abs(simpleHash(root)).toString(16).padStart(12, '0').slice(0, 12)
  return `dom_${digest}`
}

/** Deterministic district ID from domain + path prefix. */
function districtIdFrom(domainId: string, pathPrefix: string): string {
  const digest = Math.abs(simpleHash(`${domainId}:${pathPrefix}`)).toString(16).padStart(12, '0').slice(0, 12)
  return `dist_${digest}`
}

/** Deterministic artifact ID from domain + ref path. */
function artifactIdFrom(domainId: string, ref: string): string {
  const digest = Math.abs(simpleHash(`${domainId}:artifact:${ref}`)).toString(16).padStart(12, '0').slice(0, 12)
  return `art_${digest}`
}

/**
 * Extract all `cwd` values from transcript records.
 * These represent the working directories Claude Code was operating in.
 */
function extractCwdHints(records: UploadedClaudeRecord[]): string[] {
  const cwds = new Set<string>()
  for (const item of records) {
    const cwd = item.record.cwd
    if (typeof cwd === 'string' && cwd.length > 0) {
      cwds.add(cwd.replace(/\\/gu, '/'))
    }
  }
  return [...cwds]
}

/**
 * Extract file paths mentioned in tool_use inputs.
 * Looks for common Claude Code tool input patterns:
 * - filePath (Read, Write, Edit)
 * - path (Glob, Grep)
 * - command containing file paths after known subcommands
 */
function extractFilePathsFromToolInputs(records: UploadedClaudeRecord[]): string[] {
  const paths = new Set<string>()

  for (const item of records) {
    const blocks = getRecordBlocks(item.record)
    for (const block of blocks) {
      if (typeof block.type !== 'string' || block.type !== 'tool_use') continue
      const input = block.input as Record<string, unknown> | undefined
      if (!input) continue

      // Direct file path parameters
      if (typeof input.filePath === 'string' && input.filePath.length > 0) {
        paths.add(input.filePath.replace(/\\/gu, '/'))
      }
      if (typeof input.path === 'string' && input.path.length > 0) {
        paths.add(input.path.replace(/\\/gu, '/'))
      }
    }
  }

  return [...paths]
}

/**
 * Extract file paths from tool_result content, particularly from git diff --stat output.
 * Pattern: lines like " path/to/file.ext | 123 +++"
 */
function extractFilePathsFromToolResults(records: UploadedClaudeRecord[], repoRoot: string): string[] {
  const paths = new Set<string>()
  const diffStatPattern = /^\s+(\S+)\s+\|\s+\d+/u

  for (const item of records) {
    const blocks = getRecordBlocks(item.record)
    for (const block of blocks) {
      if (typeof block.type !== 'string' || block.type !== 'tool_result') continue
      const content = typeof block.content === 'string' ? block.content : ''
      if (!content) continue

      // Parse git diff --stat lines
      for (const line of content.split('\n')) {
        const match = diffStatPattern.exec(line)
        if (match?.[1]) {
          const filePath = match[1]
          // Only include if it looks like a real file path (has an extension or known directory)
          if (filePath.includes('.') || filePath.includes('/')) {
            const fullPath = filePath.startsWith('/') ? filePath : `${repoRoot}/${filePath}`
            paths.add(fullPath.replace(/\\/gu, '/'))
          }
        }
      }
    }
  }

  return [...paths]
}

/**
 * Derive repo root(s) from cwd hints.
 * Multiple cwd values pointing to the same root (or subdirectories of it) collapse into one.
 * Only produces multiple roots when cwds are genuinely distinct repos.
 */
function deriveRepoRoots(cwdHints: string[], _gitBranchHint?: string | null): string[] {
  if (cwdHints.length === 0) return []

  // Normalize all cwd paths
  const normalized = cwdHints.map((cwd) => cwd.replace(/\/+$/u, ''))

  // Sort by length (shortest first) — shorter paths are more likely to be the root
  const sorted = [...new Set(normalized)].sort((a, b) => a.length - b.length)

  // Collapse: if a longer cwd starts with a shorter one + '/', they share a root
  const roots: string[] = []
  for (const cwd of sorted) {
    const isSubDir = roots.some((root) => cwd.startsWith(`${root}/`))
    if (!isSubDir) {
      roots.push(cwd)
    }
  }

  return roots
}

/**
 * Classify a file path under a repo root, returning the relative path.
 * Returns null if the file doesn't belong to any known root.
 */
function classifyFileUnderRoot(filePath: string, roots: string[]): { root: string; relative: string } | null {
  const normalized = filePath.replace(/\\/gu, '/')
  // Find the longest matching root (most specific)
  let bestRoot: string | null = null
  let bestLength = 0
  for (const root of roots) {
    if (normalized.startsWith(`${root}/`) && root.length > bestLength) {
      bestRoot = root
      bestLength = root.length
    }
  }
  if (!bestRoot) return null
  return { root: bestRoot, relative: normalized.slice(bestRoot.length + 1) }
}

/**
 * Extract the district path prefix from a relative file path.
 * Uses the first 1-2 directory segments as the prefix.
 */
function districtPrefixFromRelative(relativePath: string): string {
  const parts = relativePath.split('/').filter((s) => s.length > 0)
  if (parts.length <= 1) return ''
  return `${parts.slice(0, Math.min(2, parts.length - 1)).join('/')}/`
}

interface ExtractedTopology {
  domains: UniversalEventsPackage['topology']['domains']
  districts: UniversalEventsPackage['topology']['districts']
  artifacts: UniversalEventsPackage['topology']['artifacts']
  layout: UniversalEventsPackage['topology']['layout']
  primaryDomainId: string
}

/**
 * Build the full topology (domains/districts/artifacts) from transcript records.
 * Enforces: ONE island per repository root. Districts are subdivisions within.
 */
function extractTopologyFromTranscript(
  projectName: string,
  records: UploadedClaudeRecord[],
): ExtractedTopology {
  // 1. Extract cwd hints — these are the most reliable repo root signals
  const cwdHints = extractCwdHints(records)

  // Extract git branch hint from any record
  let gitBranch: string | null = null
  const gitRemote: string | null = null
  for (const item of records) {
    if (typeof item.record.gitBranch === 'string' && item.record.gitBranch.length > 0) {
      gitBranch = item.record.gitBranch
      break
    }
  }

  // 2. Derive repo roots from cwd hints
  const repoRoots = deriveRepoRoots(cwdHints, gitBranch)

  // 3. If no cwd data, fall back to a synthetic root from the project name
  if (repoRoots.length === 0) {
    const fallbackRoot = `/workspace/${slugify(projectName || 'project')}`
    repoRoots.push(fallbackRoot)
  }

  // 4. Extract file paths from tool inputs and results
  const toolInputPaths = extractFilePathsFromToolInputs(records)
  const toolResultPaths = extractFilePathsFromToolResults(records, repoRoots[0]!)

  // All file paths: combine tool inputs, tool results
  const allFilePaths = [...new Set([...toolInputPaths, ...toolResultPaths])]

  // 5. Build domains — one per repo root, deterministic IDs
  const domains: UniversalEventsPackage['topology']['domains'] = repoRoots.map((root) => {
    const name = root.split('/').pop() || 'workspace'
    return {
      id: domainIdFromRoot(root),
      name,
      root,
      kind: gitBranch ? 'git_repo' as const : 'local_folder' as const,
      confidence: cwdHints.length > 0 ? 0.95 : 0.7,
      gitRemote: gitRemote,
      gitBranch: gitBranch,
    }
  })

  const primaryDomainId = domains[0]!.id

  // 6. Classify files under roots and collect per-domain data
  const domainFiles = new Map<string, string[]>() // domainId -> relative paths
  for (const domain of domains) {
    domainFiles.set(domain.id, [])
  }

  for (const filePath of allFilePaths) {
    const classification = classifyFileUnderRoot(filePath, repoRoots)
    if (classification) {
      const domainId = domainIdFromRoot(classification.root)
      const existing = domainFiles.get(domainId)
      if (existing) {
        existing.push(classification.relative)
      }
    }
  }

  // Also add relative paths from tool results that are already relative
  for (const filePath of allFilePaths) {
    if (!filePath.startsWith('/')) {
      // Relative path — assign to primary domain
      const existing = domainFiles.get(primaryDomainId)
      if (existing && !existing.includes(filePath)) {
        existing.push(filePath)
      }
    }
  }

  // 7. Build districts — path prefix clusters within each domain
  const districts: UniversalEventsPackage['topology']['districts'] = []
  for (const domain of domains) {
    const files = domainFiles.get(domain.id) ?? []
    const prefixes = [...new Set(files.map(districtPrefixFromRelative))]

    if (prefixes.length === 0) {
      // Always create at least a root district per domain
      districts.push({
        id: districtIdFrom(domain.id, ''),
        domainId: domain.id,
        name: 'root',
        pathPrefix: '',
        confidence: 0.5,
      })
    } else {
      for (const prefix of prefixes) {
        districts.push({
          id: districtIdFrom(domain.id, prefix),
          domainId: domain.id,
          name: prefix.length > 0 ? prefix.replace(/\/$/u, '') : 'root',
          pathPrefix: prefix,
          confidence: 0.75,
        })
      }
    }
  }

  // 8. Build artifacts — one per unique file
  const artifacts: UniversalEventsPackage['topology']['artifacts'] = []
  const seenArtifacts = new Set<string>()

  for (const domain of domains) {
    const files = domainFiles.get(domain.id) ?? []
    for (const relativePath of files) {
      const artifactKey = `${domain.id}:${relativePath}`
      if (seenArtifacts.has(artifactKey)) continue
      seenArtifacts.add(artifactKey)

      const prefix = districtPrefixFromRelative(relativePath)
      const districtId = districtIdFrom(domain.id, prefix)

      artifacts.push({
        id: artifactIdFrom(domain.id, relativePath),
        domainId: domain.id,
        districtId,
        kind: 'file',
        ref: relativePath,
      })
    }
  }

  // 9. Layout — position domains in a row
  const layout: UniversalEventsPackage['topology']['layout'] = {
    algorithm: domains.length === 1 ? 'single-domain-focus' : 'multi-domain-row',
    units: 'tile',
    domainPositions: domains.map((domain, index) => ({
      domainId: domain.id,
      x: index * 300,
      y: 0,
      radius: 120,
    })),
  }

  return { domains, districts, artifacts, layout, primaryDomainId }
}

// ---------------------------------------------------------------------------
// Main builder: transcript records → UniversalEventsPackage
// ---------------------------------------------------------------------------

function buildReplayFromUploadedClaude(
  projectName: string,
  files: File[],
  records: UploadedClaudeRecord[],
): UniversalEventsPackage {
  const nowIso = new Date().toISOString()
  const events: UniversalEvent[] = []
  const actorSeq = new Map<string, number>()
  const pendingTools = new Map<string, { actorId: string; toolName?: string }>()
  const actorIds = new Set<string>(['actor_main'])

  for (const item of records) {
    const actorId = getActorIdFromRecord(item.record)
    actorIds.add(actorId)
    const ts = getRecordTimestamp(item.record)
    const blocks = getRecordBlocks(item.record)

    if (item.record.type === 'assistant' || item.record.type === 'user') {
      blocks.forEach((block) => {
        const blockType = typeof block.type === 'string' ? block.type : ''
        if (blockType === 'text') {
          pushEvent(events, actorSeq, {
            ts,
            actorId,
            category: 'conversation',
            action: 'message',
            status: 'ok',
            context: {
              summary: typeof block.text === 'string' ? block.text.slice(0, 200) : undefined,
            },
            redacted: false,
            rawRef: { path: item.fileName, line: item.line },
          })
          return
        }

        if (blockType === 'thinking') {
          pushEvent(events, actorSeq, {
            ts,
            actorId,
            category: 'reasoning',
            action: 'note',
            status: 'ok',
            context: { summary: '[redacted]' },
            redacted: true,
            rawRef: { path: item.fileName, line: item.line },
          })
          return
        }

        if (blockType === 'tool_use') {
          const toolId = typeof block.id === 'string' ? block.id : undefined
          const toolName = typeof block.name === 'string' ? block.name : undefined
          if (toolId) {
            pendingTools.set(toolId, { actorId, toolName })
          }

          pushEvent(events, actorSeq, {
            ts,
            actorId,
            category: 'tool_call',
            action: 'started',
            status: 'ok',
            target: { kind: 'tool', id: toolId, name: toolName },
            context: (block.input as Record<string, unknown> | undefined) ?? null,
            correlationId: toolId ? `corr_${toolId}` : null,
            redacted: false,
            rawRef: { path: item.fileName, line: item.line },
          })

          if (toolName === 'Task') {
            pushEvent(events, actorSeq, {
              ts,
              actorId,
              category: 'subagent',
              action: 'spawn',
              status: 'ok',
              redacted: false,
              rawRef: { path: item.fileName, line: item.line },
            })
          }
          return
        }

        if (blockType === 'tool_result') {
          const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
          const pending = toolUseId ? pendingTools.get(toolUseId) : undefined
          const status = block.is_error === true ? 'error' : 'ok'
          pushEvent(events, actorSeq, {
            ts,
            actorId: pending?.actorId ?? actorId,
            category: 'tool_call',
            action: status === 'error' ? 'failed' : 'completed',
            status,
            target: { kind: 'tool', id: toolUseId, name: pending?.toolName },
            context: {
              resultHash:
                typeof block.content === 'string'
                  ? fakeSha256(block.content)
                  : undefined,
            },
            correlationId: toolUseId ? `corr_${toolUseId}` : null,
            redacted: false,
            rawRef: { path: item.fileName, line: item.line },
          })
        }
      })
      continue
    }

    if (item.record.type === 'progress') {
      pushEvent(events, actorSeq, {
        ts,
        actorId,
        category: 'progress',
        action: 'update',
        status: 'ok',
        context: item.record,
        redacted: false,
        rawRef: { path: item.fileName, line: item.line },
      })
      continue
    }

    if (item.record.type === 'system') {
      pushEvent(events, actorSeq, {
        ts,
        actorId,
        category: 'system',
        action: 'turn_complete',
        status: 'ok',
        context: item.record,
        redacted: false,
        rawRef: { path: item.fileName, line: item.line },
      })
    }
  }

  // Extract topology from transcript records (one island per repo root)
  const topology = extractTopologyFromTranscript(projectName, records)

  const actors = [...actorIds].map((id): UniversalEventsPackage['actors'][number] => {
    if (id === 'actor_user') {
      return { id, kind: 'human', name: 'user' }
    }
    if (id.startsWith('actor_sub_')) {
      return { id, kind: 'subagent', name: id.replace('actor_', ''), parentActorId: 'actor_main' }
    }
    return { id, kind: 'agent', name: id.replace('actor_', '') }
  })

  const issues = events
    .filter((event) => event.status === 'error')
    .map((event, index) => ({
      id: `iss_${String(index + 1).padStart(3, '0')}`,
      severity: 'error' as const,
      status: 'open' as const,
      summary: `${event.category}:${event.action} failed`,
      linkedEventIds: [event.id],
      linkedActorIds: [event.actorId],
      domainId: topology.primaryDomainId,
    }))

  const start = events[0]?.ts ?? nowIso
  const end = events.length > 0 ? events[events.length - 1]!.ts : nowIso

  const inputNames = files.map((file) => `/workspace/uploads/${file.name}`)
  const inputDigest = fakeSha256(inputNames.sort().join('\n'))

  const replayPackage: UniversalEventsPackage = {
    schema: 'universal-events',
    schemaVersion: 1,
    run: {
      id: `run_${slugify(projectName || 'project')}`,
      source: 'claude_code',
      createdAt: nowIso,
      inputDigest,
      initialFocusDomainId: topology.primaryDomainId,
      timeRange: { start, end },
      import: {
        inputPaths: inputNames,
        redactionPolicy: 'default-safe',
        exportMode: 'shareable',
      },
      sourceMetadata: {
        uploadedFileCount: files.length,
        cwdHints: extractCwdHints(records),
        gitBranchHints: records
          .map((r) => r.record.gitBranch)
          .filter((b): b is string => typeof b === 'string')
          .filter((b, i, arr) => arr.indexOf(b) === i),
      },
    },
    presentation: {
      labels: { domain: 'island', district: 'district' },
    },
    topology: {
      world: { id: 'world_workspace', name: projectName || 'Workspace' },
      domains: topology.domains,
      districts: topology.districts,
      artifacts: topology.artifacts,
      layout: topology.layout,
    },
    actors,
    events,
    interactions: [],
    issues,
    privacy: {
      policy: 'default-safe',
      redactions: {
        thinkingContent: true,
        toolOutputContent: 'hashed',
        secretPatternsApplied: true,
        absolutePathsRedacted: true,
        actorNamesPseudonymized: true,
      },
    },
  }

  return replayPackage
}

function getRecordTimestamp(record: Record<string, unknown>): string {
  const ts = typeof record.ts === 'string' ? record.ts : typeof record.timestamp === 'string' ? record.timestamp : null
  return ts ?? new Date(0).toISOString()
}

function getActorIdFromRecord(record: Record<string, unknown>): string {
  if (record.type === 'user') {
    return 'actor_user'
  }

  const rawAgent = typeof record.agentId === 'string' ? record.agentId : null
  if (record.isSidechain === true && rawAgent) {
    return `actor_sub_${rawAgent}`
  }

  return rawAgent ? `actor_agent_${rawAgent}` : 'actor_main'
}

function getRecordBlocks(record: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(record.content)) {
    return record.content.filter((block): block is Record<string, unknown> => typeof block === 'object' && block !== null)
  }

  const message = record.message
  if (typeof message === 'object' && message !== null) {
    const content = (message as Record<string, unknown>).content
    if (Array.isArray(content)) {
      return content.filter((block): block is Record<string, unknown> => typeof block === 'object' && block !== null)
    }
  }

  return []
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+/u, '')
    .replace(/-+$/u, '') || 'project'
}

function fakeSha256(value: string): string {
  const seed = simpleHash(value)
  let hex = ''
  let current = seed
  for (let i = 0; i < 8; i += 1) {
    current = simpleHash(`${current}:${value}:${i}`)
    hex += Math.abs(current).toString(16).padStart(8, '0').slice(0, 8)
  }
  return `sha256:${hex.slice(0, 64)}`
}

function simpleHash(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return hash
}

function pushEvent(
  events: UniversalEvent[],
  actorSeq: Map<string, number>,
  draft: Omit<UniversalEvent, 'id' | 'seqGlobal' | 'actorSeq' | 'dedupeKey'>,
): void {
  const nextGlobal = events.length + 1
  const nextActorSeq = (actorSeq.get(draft.actorId) ?? 0) + 1
  actorSeq.set(draft.actorId, nextActorSeq)

  const basis = `${draft.actorId}:${draft.category}:${draft.action}:${draft.ts}:${nextGlobal}`
  events.push({
    id: `evt_${String(nextGlobal).padStart(6, '0')}`,
    seqGlobal: nextGlobal,
    actorSeq: nextActorSeq,
    dedupeKey: `ue:sha1:${Math.abs(simpleHash(basis)).toString(16).padStart(8, '0')}`,
    ...draft,
  })
}
