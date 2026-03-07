import type {
  AgentEvent,
  AgentEventType,
  Building,
  District,
  Island,
  PlanetSnapshot,
  ScenarioData,
  UniversalEvent,
  UniversalEventsPackage,
} from '@multiverse/shared'

function toAgentEventType(event: UniversalEvent): AgentEventType {
  if (event.category === 'file_change') {
    if (event.action === 'create') return 'file_create'
    if (event.action === 'edit') return 'file_edit'
    if (event.action === 'delete') return 'file_delete'
  }

  if (event.category === 'conversation') return 'message_send'
  if (event.category === 'subagent') {
    if (event.action === 'spawn') return 'subagent_spawn'
    if (event.action === 'complete') return 'subagent_complete'
    return 'task_start'
  }
  if (event.category === 'tool_call') return 'tool_use'
  if (event.status === 'error') return 'error_spawn'

  return 'idle'
}

function makeCoord(x: number, y: number) {
  return {
    chunk_x: Math.floor(x / 64),
    chunk_y: Math.floor(y / 64),
    local_x: x % 64,
    local_y: y % 64,
  }
}

function buildSnapshot(input: UniversalEventsPackage): PlanetSnapshot {
  const planetId = input.topology.world.id
  const domainPositions = new Map(
    input.topology.layout?.domainPositions?.map((position) => [position.domainId, position]) ?? [],
  )

  const islands: Island[] = input.topology.domains.map((domain, index) => {
    const layout = domainPositions.get(domain.id)
    const x = Math.round((layout?.x ?? index * 220) + 512)
    const y = Math.round((layout?.y ?? index * 140) + 512)
    return {
      id: domain.id,
      planet_id: planetId,
      name: domain.name,
      position: makeCoord(x, y),
      biome: 'plains',
      bounds: { width: 160, height: 120 },
    }
  })

  const districts: District[] = input.topology.districts.map((district, index) => {
    const island = islands.find((candidate) => candidate.id === district.domainId)
    return {
      id: district.id,
      island_id: district.domainId,
      name: district.name,
      position: makeCoord(
        (island?.position.chunk_x ?? 0) * 64 + ((island?.position.local_x ?? 0) + 20 + index * 4),
        (island?.position.chunk_y ?? 0) * 64 + ((island?.position.local_y ?? 0) + 20 + index * 4),
      ),
      bounds: { width: 24, height: 24 },
    }
  })

  const buildings: Building[] = input.topology.artifacts
    .filter((artifact) => artifact.kind === 'file')
    .map((artifact, index) => {
      const district = districts.find((candidate) => candidate.id === artifact.districtId)
      return {
        id: artifact.id,
        district_id: artifact.districtId,
        name: artifact.ref.split('/').at(-1) ?? artifact.ref,
        position: makeCoord(
          (district?.position.chunk_x ?? 0) * 64 + ((district?.position.local_x ?? 0) + index % 8),
          (district?.position.chunk_y ?? 0) * 64 + ((district?.position.local_y ?? 0) + Math.floor(index / 8)),
        ),
        footprint: { width: 1, height: 1 },
        style: 'residential',
        file_count: 1,
        health: 100,
      }
    })

  return {
    snapshot_version: 1,
    planet_id: planetId,
    planet_name: input.topology.world.name,
    generated_at: Date.now(),
    agent_cursors: {},
    islands,
    districts,
    buildings,
    tiles: [],
    agents: [],
    sub_agents: [],
    monsters: [],
    work_items: [],
    connections: [],
  }
}

function buildEvents(input: UniversalEventsPackage): AgentEvent[] {
  const planetId = input.topology.world.id
  const perActorSeq = new Map<string, number>()

  return input.events.map((event, index) => {
    const seq = (perActorSeq.get(event.actorId) ?? 0) + 1
    perActorSeq.set(event.actorId, seq)

    return {
      id: event.id,
      schema_version: 1,
      dedupe_key: event.dedupeKey,
      agent_id: event.actorId,
      planet_id: planetId,
      seq,
      timestamp: Date.parse(event.ts) || index,
      kind: event.status === 'error' ? 'fx' : 'mutation',
      type: toAgentEventType(event),
      source: 'agent_runtime',
      target: {
        building_id: event.target?.kind === 'artifact' ? event.target.id : undefined,
        district_id:
          typeof event.context?.districtId === 'string' ? event.context.districtId : undefined,
        island_id:
          typeof event.context?.domainId === 'string' ? event.context.domainId : undefined,
        tool_id: event.target?.kind === 'tool' ? event.target.id : undefined,
      },
      metadata: {
        category: event.category,
        action: event.action,
        status: event.status,
        correlationId: event.correlationId,
      },
    }
  })
}

export function projectUniversalEventsToScenarioData(
  input: UniversalEventsPackage,
): ScenarioData {
  return {
    name: input.run.id,
    description: `Imported replay from ${input.run.source}`,
    snapshot: buildSnapshot(input),
    events: buildEvents(input),
  }
}
