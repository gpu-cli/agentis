// ============================================================================
// World Model — Adapter (WorldModelSnapshot → ScenarioData) (hq-gij.3.1)
// ============================================================================

import { describe, it, expect } from 'vitest'
import { toScenarioData } from '../adapter'
import { buildWorkUnits } from '../work-units'
import { buildWorldSkeleton } from '../skeleton'
import { solveLayout } from '../layout-solver'
import type { CanonicalWorkModel, CanonicalOperation, ActorRef, WorldModelSnapshot } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTOR: ActorRef = { id: 'actor_main', kind: 'agent', parentId: null, name: 'Claude' }
const SUB_ACTOR: ActorRef = { id: 'actor_sub_1', kind: 'subagent', parentId: 'actor_main', name: 'Sub1' }

function buildSnapshot(fileCount: number): WorldModelSnapshot {
  const ops = Array.from({ length: fileCount }, (_, i) => ({
    id: `op_${i}`,
    timestamp: 1000 + i * 100,
    actor: i % 4 === 0 ? SUB_ACTOR : ACTOR,
    kind: i % 3 === 0 ? 'file_write' as const : 'file_read' as const,
    targetPath: `/project/src/file${i}.ts`,
    repoRoot: '/project',
    branch: 'main',
    toolName: i % 3 === 0 ? 'Write' : 'Read',
    summary: `op ${i}`,
    rawRef: { file: 'session.jsonl', line: i },
  }))

  const model: CanonicalWorkModel = {
    project: {
      name: 'test-project',
      nameConfidence: 'user_provided',
      repos: [{ root: '/project', name: 'test-project', inferredFrom: 'cwd', branches: [{ name: 'main', isMain: true, confidence: 'convention' }] }],
      observedFileCount: fileCount,
      source: { format: 'claude_code_jsonl', recordCount: ops.length, timeRange: { start: 1000, end: 1000 + fileCount * 100 } },
    },
    actors: [ACTOR, SUB_ACTOR],
    operations: ops,
    filesPerTile: 1,
  }

  const workUnits = buildWorkUnits(model.operations, 1, '/project')
  const { world, workUnits: assigned } = buildWorldSkeleton(model, workUnits)
  solveLayout(world)

  return {
    version: 1,
    generatedAt: Date.now(),
    world,
    workUnits: assigned,
    actors: model.actors,
    layoutMeta: {
      seed: 42,
      filesPerTile: 1,
      totalObservedFiles: fileCount,
      solverIterations: 1,
    },
  }
}

function buildSnapshotFromPaths(paths: string[]): WorldModelSnapshot {
  const ops: CanonicalOperation[] = paths.map((path, i) => ({
    id: `op_path_${i}`,
    timestamp: 1000 + i * 100,
    actor: ACTOR,
    kind: 'file_create',
    targetPath: `/project/${path}`,
    repoRoot: '/project',
    branch: 'main',
    toolName: 'Write',
    summary: `create ${path}`,
    rawRef: { file: 'session.jsonl', line: i + 1 },
  }))

  const model: CanonicalWorkModel = {
    project: {
      name: 'gap-regression',
      nameConfidence: 'user_provided',
      repos: [{ root: '/project', name: 'gap-regression', inferredFrom: 'cwd', branches: [{ name: 'main', isMain: true, confidence: 'convention' }] }],
      observedFileCount: paths.length,
      source: { format: 'claude_code_jsonl', recordCount: ops.length, timeRange: { start: 1000, end: 1000 + paths.length * 100 } },
    },
    actors: [ACTOR],
    operations: ops,
    filesPerTile: 1,
  }

  const workUnits = buildWorkUnits(model.operations, 1, '/project')
  const { world, workUnits: assigned } = buildWorldSkeleton(model, workUnits)
  solveLayout(world)

  return {
    version: 1,
    generatedAt: Date.now(),
    world,
    workUnits: assigned,
    actors: model.actors,
    operations: ops,
    layoutMeta: {
      seed: 42,
      filesPerTile: 1,
      totalObservedFiles: paths.length,
      solverIterations: 1,
    },
  }
}

function getTileCreateEventForPath(scenario: ReturnType<typeof toScenarioData>, relativePath: string) {
  const absolutePath = `/project/${relativePath}`
  return scenario.events.find((event) => {
    if (event.type !== 'file_create' || event.source !== 'agent_runtime') return false
    if (!event.dedupe_key.includes(':tile_create')) return false
    return (event.metadata as Record<string, unknown>).path === absolutePath
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('toScenarioData', () => {
  it('produces valid ScenarioData with all required fields', () => {
    const snapshot = buildSnapshot(10)
    const scenario = toScenarioData(snapshot)

    expect(scenario.name).toBe('test-project')
    expect(scenario.description).toBeTruthy()
    expect(scenario.snapshot).toBeDefined()
    expect(scenario.events).toBeDefined()
  })

  it('creates islands from world model islands', () => {
    const snapshot = buildSnapshot(10)
    const scenario = toScenarioData(snapshot)

    expect(scenario.snapshot.islands.length).toBeGreaterThanOrEqual(1)
    for (const island of scenario.snapshot.islands) {
      expect(island.id).toBeTruthy()
      expect(island.name).toBeTruthy()
      expect(island.biome).toBeTruthy()
      expect(island.bounds.width).toBeGreaterThan(0)
    }
  })

  it('creates districts with positions offset by island', () => {
    const snapshot = buildSnapshot(15)
    const scenario = toScenarioData(snapshot)

    expect(scenario.snapshot.districts.length).toBeGreaterThanOrEqual(1)
    for (const district of scenario.snapshot.districts) {
      expect(district.island_id).toBeTruthy()
      expect(district.bounds.width).toBeGreaterThan(0)
    }
  })

  it('creates buildings with correct style based on size band', () => {
    const snapshot = buildSnapshot(15)
    const scenario = toScenarioData(snapshot)

    expect(scenario.snapshot.buildings.length).toBeGreaterThanOrEqual(1)
    for (const building of scenario.snapshot.buildings) {
      expect(building.district_id).toBeTruthy()
      expect(['house', 'large', 'tower']).toContain(building.style)
      // Buildings start empty — tiles arrive via events during replay
      expect(building.file_count).toBe(0)
      expect(building.planned_file_count).toBeGreaterThanOrEqual(1)
    }
  })

  it('tiles arrive via events not snapshot (buildings grow from empty)', () => {
    const snapshot = buildSnapshot(10)
    const scenario = toScenarioData(snapshot)

    // No tiles seeded at t=0 — all tiles come via file_create events
    expect(scenario.snapshot.tiles.length).toBe(0)

    // But file_create events exist to populate tiles during replay
    const createEvents = scenario.events.filter(e => e.type === 'file_create')
    expect(createEvents.length).toBeGreaterThanOrEqual(1)
    for (const event of createEvents) {
      expect(event.target?.tile_id).toBeTruthy()
      expect(event.target?.building_id).toBeTruthy()
    }
  })

  it('creates agents from non-human actors', () => {
    const snapshot = buildSnapshot(10)
    const scenario = toScenarioData(snapshot)

    // Should have the main agent
    const agents = scenario.snapshot.agents
    expect(agents.length).toBeGreaterThanOrEqual(1)
    expect(agents.some(a => a.id === 'actor_main')).toBe(true)

    // Human actors should NOT be rendered as agents
    expect(agents.some(a => a.id === 'actor_user')).toBe(false)
  })

  it('creates subagents from subagent actors', () => {
    const snapshot = buildSnapshot(10)
    const scenario = toScenarioData(snapshot)

    const subAgents = scenario.snapshot.sub_agents
    expect(subAgents.length).toBeGreaterThanOrEqual(1)
    expect(subAgents[0]!.parent_agent_id).toBe('actor_main')
  })

  it('generates replay events from work units', () => {
    const snapshot = buildSnapshot(10)
    const scenario = toScenarioData(snapshot)

    expect(scenario.events.length).toBeGreaterThanOrEqual(1)
    for (const event of scenario.events) {
      expect(event.id).toBeTruthy()
      expect(event.timestamp).toBeGreaterThan(0)
      expect(['mutation', 'fx']).toContain(event.kind)
    }
  })

  it('events reference valid buildings', () => {
    const snapshot = buildSnapshot(10)
    const scenario = toScenarioData(snapshot)

    const buildingIds = new Set(scenario.snapshot.buildings.map(b => b.id))
    for (const event of scenario.events) {
      if (event.target?.building_id) {
        expect(buildingIds.has(event.target.building_id)).toBe(true)
      }
    }
  })

  it('produces no NaN or Infinity in output', () => {
    const snapshot = buildSnapshot(10)
    const scenario = toScenarioData(snapshot)

    const json = JSON.stringify(scenario)
    expect(json).not.toContain('NaN')
    expect(json).not.toContain('Infinity')
  })

  it('sets ghost buildings to health 0 (all buildings start empty)', () => {
    const snapshot = buildSnapshot(5)

    // Force a ghost building
    for (const wu of snapshot.workUnits) {
      wu.materialState = 'ghost'
    }
    for (const island of snapshot.world.islands) {
      for (const district of island.districts) {
        for (const building of district.buildings) {
          building.materialState = 'ghost'
        }
      }
    }

    const scenario = toScenarioData(snapshot)
    for (const building of scenario.snapshot.buildings) {
      // All buildings start at 0 health since no tiles are seeded at t=0
      expect(building.health).toBe(0)
    }
  })
})

describe('gap regression (F4.3)', () => {
  it('uses footprint-aware tile packing widths (2-file building => 2, 7-file building => 3)', () => {
    const smallPaths = ['src/small/a.ts', 'src/small/b.ts']
    const largePaths = Array.from({ length: 7 }, (_, i) => `src/large/file${i}.ts`)
    const snapshot = buildSnapshotFromPaths([...smallPaths, ...largePaths])
    const scenario = toScenarioData(snapshot)

    const smallBuilding = scenario.snapshot.buildings.find(b => b.planned_file_count === 2)
    const largeBuilding = scenario.snapshot.buildings.find(b => b.planned_file_count === 7)

    expect(smallBuilding).toBeDefined()
    expect(largeBuilding).toBeDefined()
    expect(smallBuilding?.planned_footprint?.width).toBe(2)
    expect(largeBuilding?.planned_footprint?.width).toBe(3)
  })

  it('maps tile local coordinates to a 3-wide footprint for 5-file buildings', () => {
    const paths = Array.from({ length: 5 }, (_, i) => `src/medium/file${i}.ts`)
    const snapshot = buildSnapshotFromPaths(paths)
    const scenario = toScenarioData(snapshot)

    const building = scenario.snapshot.buildings.find(b => b.planned_file_count === 5)
    expect(building).toBeDefined()
    expect(building?.planned_footprint?.width).toBe(3)

    const expectedLocals = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]

    for (const [i, path] of paths.entries()) {
      const event = getTileCreateEventForPath(scenario, path)
      expect(event).toBeDefined()
      expect((event!.metadata as Record<string, unknown>).local).toEqual(expectedLocals[i]!)
    }
  })

  it('maps tile local coordinates to a 2-wide footprint for 2-file buildings', () => {
    const paths = ['src/tiny/file0.ts', 'src/tiny/file1.ts']
    const snapshot = buildSnapshotFromPaths(paths)
    const scenario = toScenarioData(snapshot)

    const building = scenario.snapshot.buildings.find(b => b.planned_file_count === 2)
    expect(building).toBeDefined()
    expect(building?.planned_footprint?.width).toBe(2)

    const first = getTileCreateEventForPath(scenario, paths[0]!)
    const second = getTileCreateEventForPath(scenario, paths[1]!)

    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect((first!.metadata as Record<string, unknown>).local).toEqual({ x: 0, y: 0 })
    expect((second!.metadata as Record<string, unknown>).local).toEqual({ x: 1, y: 0 })
  })
})

// ---------------------------------------------------------------------------
// Delete lifecycle in adapter event generation
// ---------------------------------------------------------------------------

describe('file_delete event generation', () => {
  function buildSnapshotWithOps(ops: CanonicalOperation[]): WorldModelSnapshot {
    const model: CanonicalWorkModel = {
      project: {
        name: 'delete-test',
        nameConfidence: 'user_provided',
        repos: [{ root: '/project', name: 'delete-test', inferredFrom: 'cwd', branches: [{ name: 'main', isMain: true, confidence: 'convention' }] }],
        observedFileCount: ops.length,
        source: { format: 'claude_code_jsonl', recordCount: ops.length, timeRange: { start: 1000, end: 5000 } },
      },
      actors: [ACTOR],
      operations: ops,
      filesPerTile: 1,
    }

    const workUnits = buildWorkUnits(model.operations, 1, '/project')
    const { world, workUnits: assigned } = buildWorldSkeleton(model, workUnits)
    solveLayout(world)

    return {
      version: 1,
      generatedAt: Date.now(),
      world,
      workUnits: assigned,
      actors: model.actors,
      operations: ops,
      layoutMeta: { seed: 42, filesPerTile: 1, totalObservedFiles: ops.length, solverIterations: 1 },
    }
  }

  it('emits file_delete events for delete operations', () => {
    const ops: CanonicalOperation[] = [
      { id: 'op_1', timestamp: 1000, actor: ACTOR, kind: 'file_create', targetPath: '/project/src/temp.ts', repoRoot: '/project', branch: 'main', toolName: 'Write', summary: 'create temp', rawRef: { file: 'session.jsonl', line: 1 } },
      { id: 'op_2', timestamp: 2000, actor: ACTOR, kind: 'file_delete', targetPath: '/project/src/temp.ts', repoRoot: '/project', branch: 'main', toolName: 'Bash', summary: 'delete temp', rawRef: { file: 'session.jsonl', line: 2 } },
    ]

    const snapshot = buildSnapshotWithOps(ops)
    const scenario = toScenarioData(snapshot)
    const deleteEvents = scenario.events.filter(e => e.type === 'file_delete')
    expect(deleteEvents.length).toBeGreaterThanOrEqual(1)
  })

  it('does not synthesize completion events for deleted files', () => {
    const ops: CanonicalOperation[] = [
      { id: 'op_1', timestamp: 1000, actor: ACTOR, kind: 'file_create', targetPath: '/project/src/keep.ts', repoRoot: '/project', branch: 'main', toolName: 'Write', summary: 'create keep', rawRef: { file: 'session.jsonl', line: 1 } },
      { id: 'op_2', timestamp: 2000, actor: ACTOR, kind: 'file_create', targetPath: '/project/src/remove.ts', repoRoot: '/project', branch: 'main', toolName: 'Write', summary: 'create remove', rawRef: { file: 'session.jsonl', line: 2 } },
      { id: 'op_3', timestamp: 3000, actor: ACTOR, kind: 'file_delete', targetPath: '/project/src/remove.ts', repoRoot: '/project', branch: 'main', toolName: 'Bash', summary: 'delete remove', rawRef: { file: 'session.jsonl', line: 3 } },
    ]

    const snapshot = buildSnapshotWithOps(ops)
    const scenario = toScenarioData(snapshot)

    // The synthetic completion pass should not emit file_create or file_edit for 'remove.ts'
    const synthEvents = scenario.events.filter(e =>
      e.source === 'synthetic' &&
      (e.metadata as Record<string, unknown>)?.path === 'src/remove.ts'
    )
    expect(synthEvents.length).toBe(0)
  })

  it('error operations produce error_spawn events with monster targets', () => {
    const ops: CanonicalOperation[] = [
      { id: 'op_1', timestamp: 1000, actor: ACTOR, kind: 'command_run', targetPath: null, repoRoot: '/project', branch: 'main', toolName: 'Bash', summary: 'docker logs', rawRef: { file: 'session.jsonl', line: 1 }, isError: true },
      { id: 'op_2', timestamp: 5000, actor: ACTOR, kind: 'file_write', targetPath: '/project/src/fix.ts', repoRoot: '/project', branch: 'main', toolName: 'Edit', summary: 'fix code', rawRef: { file: 'session.jsonl', line: 2 } },
    ]

    const snapshot = buildSnapshotWithOps(ops)
    const scenario = toScenarioData(snapshot)

    // Error ops should produce error_spawn events
    const errorSpawn = scenario.events.filter(e => e.type === 'error_spawn')
    expect(errorSpawn.length).toBe(1)
    expect(errorSpawn[0]!.target?.monster_id).toBe('monster_op_1')
    expect((errorSpawn[0]!.metadata as Record<string, unknown>).severity).toBe('error')
    expect((errorSpawn[0]!.metadata as Record<string, unknown>).message).toBe('docker logs')
    expect((errorSpawn[0]!.metadata as Record<string, unknown>).tool_name).toBe('Bash')

    // No combat events emitted by the adapter
    const combatStart = scenario.events.filter(e => e.type === 'combat_start')
    const combatEnd = scenario.events.filter(e => e.type === 'combat_end')
    expect(combatStart.length).toBe(0)
    expect(combatEnd.length).toBe(0)

    // Error ops should NOT produce tool_use events
    const errorToolUse = scenario.events.filter(e =>
      e.type === 'tool_use' && (e.metadata as Record<string, unknown>).error_transient === true
    )
    expect(errorToolUse.length).toBe(0)
  })
})
