// ============================================================================
// World Model — Adapter (WorldModelSnapshot → ScenarioData) (hq-gij.3.1)
// ============================================================================

import { describe, it, expect } from 'vitest'
import { toScenarioData } from '../adapter'
import { buildWorkUnits } from '../work-units'
import { buildWorldSkeleton } from '../skeleton'
import { solveLayout } from '../layout-solver'
import type { CanonicalWorkModel, ActorRef, WorldModelSnapshot } from '../types'

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
      expect(building.file_count).toBeGreaterThanOrEqual(1)
    }
  })

  it('creates tiles for work units in buildings', () => {
    const snapshot = buildSnapshot(10)
    const scenario = toScenarioData(snapshot)

    expect(scenario.snapshot.tiles.length).toBeGreaterThanOrEqual(1)
    for (const tile of scenario.snapshot.tiles) {
      expect(tile.building_id).toBeTruthy()
      expect(tile.file_name).toBeTruthy()
      expect(['building', 'scaffolding']).toContain(tile.state)
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

  it('sets ghost buildings to lower health', () => {
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
      expect(building.health).toBe(30)
    }
  })
})
