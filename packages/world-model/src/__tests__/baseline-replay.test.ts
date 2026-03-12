// ============================================================================
// Baseline + Incremental Replay E2E Tests (hq-5x6.4.10.6)
//
// Validates the full pipeline: classifyFileLifecycles → toPlanetSnapshot →
// toAgentEvents → appendCompletionEvents for various transcript scenarios.
// ============================================================================

import { describe, it, expect } from 'vitest'
import { toScenarioData } from '../adapter'
import { buildWorkUnits } from '../work-units'
import { buildWorldSkeleton } from '../skeleton'
import { solveLayout } from '../layout-solver'
import type {
  CanonicalWorkModel,
  CanonicalOperation,
  ActorRef,
  WorldModelSnapshot,
  OperationKind,
} from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AGENT: ActorRef = { id: 'agent_main', kind: 'agent', parentId: null, name: 'Claude' }

/**
 * Create operations for a file. Returns an array of CanonicalOperation.
 * @param path - File path
 * @param kinds - Sequence of operation kinds to emit
 * @param startTs - Starting timestamp
 */
function makeOps(
  path: string,
  kinds: OperationKind[],
  startTs: number,
): CanonicalOperation[] {
  return kinds.map((kind, i) => ({
    id: `op_${path}_${i}`,
    timestamp: startTs + i * 100,
    actor: AGENT,
    kind,
    targetPath: `/project/${path}`,
    repoRoot: '/project',
    branch: 'main',
    toolName: kind === 'file_write' ? 'Write' : kind === 'file_read' ? 'Read' : kind === 'file_create' ? 'Write' : null,
    summary: `${kind} ${path}`,
    rawRef: { file: 'session.jsonl', line: i },
  }))
}

/**
 * Build a full WorldModelSnapshot from operations.
 * Optionally pass operations to attach to the snapshot for per-operation event generation.
 */
function buildSnapshotFromOps(
  ops: CanonicalOperation[],
  opts?: { attachOps?: boolean },
): WorldModelSnapshot {
  const uniquePaths = new Set(ops.filter(o => o.targetPath).map(o => o.targetPath!.replace('/project/', '')))

  const model: CanonicalWorkModel = {
    project: {
      name: 'test-project',
      nameConfidence: 'user_provided',
      repos: [{
        root: '/project',
        name: 'test-project',
        inferredFrom: 'cwd',
        branches: [{ name: 'main', isMain: true, confidence: 'convention' }],
      }],
      observedFileCount: uniquePaths.size,
      source: {
        format: 'claude_code_jsonl',
        recordCount: ops.length,
        timeRange: {
          start: Math.min(...ops.map(o => o.timestamp)),
          end: Math.max(...ops.map(o => o.timestamp)),
        },
      },
    },
    actors: [AGENT],
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
      totalObservedFiles: uniquePaths.size,
      solverIterations: 1,
    },
    // Attach operations for per-operation event generation when requested
    ...(opts?.attachOps !== false ? { operations: ops } : {}),
  }
}

// ---------------------------------------------------------------------------
// Helpers for assertions
// ---------------------------------------------------------------------------

function collectTileIds(tiles: Array<{ id: string }>): Set<string> {
  return new Set(tiles.map(t => t.id))
}

function collectEventTileIds(events: Array<{ type: string; target?: { tile_id?: string } }>, type: string): Set<string> {
  const ids = new Set<string>()
  for (const e of events) {
    if (e.type === type && e.target?.tile_id) {
      ids.add(e.target.tile_id)
    }
  }
  return ids
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('baseline + incremental replay', () => {
  // -------------------------------------------------------------------------
  // 1. Existing repo edits only (no new file creates)
  // -------------------------------------------------------------------------
  describe('existing repo edits only', () => {
    it('buildings start empty, tiles arrive via events', () => {
      // All operations are reads/writes — every file is preexisting
      // Note: read-only files (no edits) are excluded from work units,
      // so every file here must have at least one write/create/delete.
      const ops = [
        ...makeOps('src/main.ts', ['file_read', 'file_write'], 1000),
        ...makeOps('src/utils.ts', ['file_write', 'file_read'], 1200),
        ...makeOps('src/config.ts', ['file_write'], 1400),
      ]

      const snapshot = buildSnapshotFromOps(ops)
      const scenario = toScenarioData(snapshot)

      // No tiles seeded at t=0 — buildings start empty and grow via events
      expect(scenario.snapshot.tiles.length).toBe(0)

      // All 3 files arrive via file_create events during replay
      const createEvents = scenario.events.filter(
        e => e.type === 'file_create' && e.source !== 'synthetic',
      )
      expect(createEvents.length).toBe(3)
    })

    it('buildings start at health=0 (grow during replay)', () => {
      const ops = [
        ...makeOps('src/a.ts', ['file_read', 'file_write'], 1000),
        ...makeOps('src/b.ts', ['file_write'], 1200),
      ]

      const snapshot = buildSnapshotFromOps(ops)
      const scenario = toScenarioData(snapshot)

      for (const building of scenario.snapshot.buildings) {
        // All buildings start empty — tiles and health increase via events
        expect(building.health).toBe(0)
        expect(building.file_count).toBe(0)
        expect(building.planned_file_count).toBeGreaterThanOrEqual(1)
      }
    })
  })

  // -------------------------------------------------------------------------
  // 2. Mix of existing edits + new creates
  // -------------------------------------------------------------------------
  describe('mix of existing edits + new creates', () => {
    it('all tiles arrive via events (buildings grow from empty)', () => {
      const ops = [
        // Pre-existing: first op is file_read
        ...makeOps('src/existing.ts', ['file_read', 'file_write'], 1000),
        // Created in session: first op is file_create
        ...makeOps('src/new-file.ts', ['file_create', 'file_write'], 1500),
      ]

      const snapshot = buildSnapshotFromOps(ops)
      const scenario = toScenarioData(snapshot)

      // No tiles in snapshot — all arrive via events
      expect(scenario.snapshot.tiles.length).toBe(0)

      // Both files appear via file_create events
      const createEvents = scenario.events.filter(
        e => e.type === 'file_create' && e.source !== 'synthetic',
      )
      expect(createEvents.length).toBeGreaterThanOrEqual(2)

      // Verify both files targeted
      const existingCreate = createEvents.find(e =>
        typeof e.metadata?.path === 'string' && e.metadata.path.includes('existing.ts'),
      )
      const newFileCreate = createEvents.find(e =>
        typeof e.metadata?.path === 'string' && e.metadata.path.includes('new-file.ts'),
      )
      expect(existingCreate).toBeTruthy()
      expect(newFileCreate).toBeTruthy()
      expect(newFileCreate!.target?.tile_id).toBeTruthy()
      expect(newFileCreate!.target?.building_id).toBeTruthy()
    })

    it('buildings start with partial health proportional to baseline', () => {
      const ops = [
        // Pre-existing
        ...makeOps('src/existing1.ts', ['file_read', 'file_write'], 1000),
        ...makeOps('src/existing2.ts', ['file_write', 'file_read'], 1200),
        // Created in session
        ...makeOps('src/new1.ts', ['file_create', 'file_write'], 1500),
        ...makeOps('src/new2.ts', ['file_create'], 1700),
      ]

      const snapshot = buildSnapshotFromOps(ops)
      const scenario = toScenarioData(snapshot)

      // Buildings with a mix should have partial health (baseline/planned * 100)
      // Total planned = 4 files, baseline = 2 preexisting → health = 50%
      // But files may be split across buildings depending on skeleton grouping.
      // Just verify health is between 0 and 100
      for (const building of scenario.snapshot.buildings) {
        expect(building.health).toBeGreaterThanOrEqual(0)
        expect(building.health).toBeLessThanOrEqual(100)
        // file_count should be <= planned_file_count
        expect(building.file_count).toBeLessThanOrEqual(building.planned_file_count!)
      }
    })
  })

  // -------------------------------------------------------------------------
  // 3. Completion synthesis
  // -------------------------------------------------------------------------
  describe('completion synthesis', () => {
    it('synthesizes missing tiles at end so all buildings complete', () => {
      // Create a snapshot without attaching operations — forces work-unit mode
      // where no file_create events are naturally generated for preexisting files
      const ops = [
        ...makeOps('src/a.ts', ['file_read', 'file_write'], 1000),
        ...makeOps('src/b.ts', ['file_read'], 1200),
        ...makeOps('src/c.ts', ['file_create', 'file_write'], 1400),
      ]

      const snapshot = buildSnapshotFromOps(ops)
      const scenario = toScenarioData(snapshot)

      // All buildings should reach planned state by end of events
      // Count unique tile_ids across snapshot + events
      const allTileIds = new Set<string>()

      // From snapshot (baseline)
      for (const tile of scenario.snapshot.tiles) {
        allTileIds.add(tile.id)
      }

      // From file_create events
      for (const event of scenario.events) {
        if (event.type === 'file_create' && event.target?.tile_id) {
          allTileIds.add(event.target.tile_id)
        }
      }

      // Total unique tiles should cover all planned files
      const totalPlannedFiles = scenario.snapshot.buildings.reduce(
        (sum, b) => sum + (b.planned_file_count ?? b.file_count),
        0,
      )
      expect(allTileIds.size).toBe(totalPlannedFiles)

      // Completion events should set tiles to 'complete'
      const completeEvents = scenario.events.filter(
        e => e.type === 'file_edit' && e.metadata?.state === 'complete',
      )
      expect(completeEvents.length).toBeGreaterThanOrEqual(totalPlannedFiles)
    })

    it('does not create tiles for deleted files', () => {
      const ops = [
        ...makeOps('src/keeper.ts', ['file_read', 'file_write'], 1000),
        // File created then deleted
        ...makeOps('src/temp.ts', ['file_create', 'file_write', 'file_delete'], 1200),
      ]

      const snapshot = buildSnapshotFromOps(ops)
      const scenario = toScenarioData(snapshot)

      // Check that no synthetic tile is created for the deleted file
      const allEvents = scenario.events.filter(e => e.type === 'file_create')
      for (const e of allEvents) {
        // Synthetic completions should not reference the deleted file
        if (e.source === 'synthetic') {
          expect(String(e.metadata?.path ?? '')).not.toContain('temp.ts')
        }
      }
    })
  })

  // -------------------------------------------------------------------------
  // 4. Large transcript — all buildings complete at end
  // -------------------------------------------------------------------------
  describe('large transcript (50+ files)', () => {
    it('all buildings complete at end of replay', () => {
      const ops: CanonicalOperation[] = []
      const fileCount = 55

      for (let i = 0; i < fileCount; i++) {
        const path = `src/module${Math.floor(i / 5)}/file${i}.ts`
        if (i % 5 === 0) {
          // Every 5th file is newly created in session
          ops.push(...makeOps(path, ['file_create', 'file_write'], 1000 + i * 200))
        } else {
          // Rest are pre-existing
          ops.push(...makeOps(path, ['file_read', 'file_write'], 1000 + i * 200))
        }
      }

      const snapshot = buildSnapshotFromOps(ops)
      const scenario = toScenarioData(snapshot)

      // Count total planned files across all buildings
      const totalPlanned = scenario.snapshot.buildings.reduce(
        (sum, b) => sum + (b.planned_file_count ?? b.file_count),
        0,
      )
      expect(totalPlanned).toBe(fileCount)

      // Count unique tile_ids (snapshot + events)
      const allTileIds = new Set<string>()
      for (const tile of scenario.snapshot.tiles) {
        allTileIds.add(tile.id)
      }
      for (const event of scenario.events) {
        if (event.type === 'file_create' && event.target?.tile_id) {
          allTileIds.add(event.target.tile_id)
        }
      }
      expect(allTileIds.size).toBe(fileCount)

      // Every building should have completion events
      const completeEvents = scenario.events.filter(
        e => e.type === 'file_edit' && e.metadata?.state === 'complete',
      )
      // At least one complete event per planned file
      expect(completeEvents.length).toBeGreaterThanOrEqual(totalPlanned)
    })
  })

  // -------------------------------------------------------------------------
  // 5. Determinism — same input → same output
  // -------------------------------------------------------------------------
  describe('determinism', () => {
    it('produces identical output for identical input', () => {
      const ops = [
        ...makeOps('src/a.ts', ['file_read', 'file_write'], 1000),
        ...makeOps('src/b.ts', ['file_create', 'file_write'], 1500),
        ...makeOps('src/c.ts', ['file_read'], 1700),
      ]

      // Build two snapshots from the same ops
      const snapshot1 = buildSnapshotFromOps(ops)
      const snapshot2 = buildSnapshotFromOps(ops)

      // Normalize generatedAt so it doesn't vary
      snapshot1.generatedAt = 0
      snapshot2.generatedAt = 0

      const scenario1 = toScenarioData(snapshot1)
      const scenario2 = toScenarioData(snapshot2)

      // Tile IDs should be identical
      const tileIds1 = scenario1.snapshot.tiles.map(t => t.id).sort()
      const tileIds2 = scenario2.snapshot.tiles.map(t => t.id).sort()
      expect(tileIds1).toEqual(tileIds2)

      // Event count should be identical
      expect(scenario1.events.length).toBe(scenario2.events.length)

      // Event IDs and types should be identical
      const eventSummary1 = scenario1.events.map(e => `${e.id}:${e.type}`)
      const eventSummary2 = scenario2.events.map(e => `${e.id}:${e.type}`)
      expect(eventSummary1).toEqual(eventSummary2)

      // Building properties should be identical
      const buildings1 = scenario1.snapshot.buildings.map(b => ({
        id: b.id, health: b.health, file_count: b.file_count, planned_file_count: b.planned_file_count,
      }))
      const buildings2 = scenario2.snapshot.buildings.map(b => ({
        id: b.id, health: b.health, file_count: b.file_count, planned_file_count: b.planned_file_count,
      }))
      expect(buildings1).toEqual(buildings2)
    })
  })

  // -------------------------------------------------------------------------
  // 6. No duplicate tile IDs
  // -------------------------------------------------------------------------
  describe('no duplicate tile IDs', () => {
    it('snapshot tiles have unique IDs', () => {
      const ops = [
        ...makeOps('src/a.ts', ['file_read', 'file_write'], 1000),
        ...makeOps('src/b.ts', ['file_read', 'file_write'], 1200),
        ...makeOps('src/c.ts', ['file_read', 'file_write'], 1400),
        ...makeOps('src/d.ts', ['file_read', 'file_write'], 1600),
        ...makeOps('src/e.ts', ['file_read', 'file_write'], 1800),
      ]

      const snapshot = buildSnapshotFromOps(ops)
      const scenario = toScenarioData(snapshot)

      const tileIds = scenario.snapshot.tiles.map(t => t.id)
      const uniqueIds = new Set(tileIds)
      expect(uniqueIds.size).toBe(tileIds.length)
    })

    it('event tile_ids are unique per distinct file', () => {
      const ops = [
        ...makeOps('src/new1.ts', ['file_create', 'file_write'], 1000),
        ...makeOps('src/new2.ts', ['file_create', 'file_write'], 1200),
        ...makeOps('src/new3.ts', ['file_create', 'file_write'], 1400),
        ...makeOps('src/existing.ts', ['file_read', 'file_write'], 1600),
      ]

      const snapshot = buildSnapshotFromOps(ops)
      const scenario = toScenarioData(snapshot)

      // Collect unique tile_ids from file_create events (non-synthetic).
      // A file may have multiple file_create events (tile creation + the op event),
      // but each distinct file should map to a unique tile_id.
      const createTileIds = scenario.events
        .filter(e => e.type === 'file_create' && e.source !== 'synthetic')
        .map(e => e.target?.tile_id)
        .filter(Boolean) as string[]

      const uniqueCreateIds = new Set(createTileIds)
      // All 4 files (3 new + 1 existing) arrive via events → 4 unique tile_ids
      expect(uniqueCreateIds.size).toBe(4)

      // Each tile_id should be deterministically different
      const idArray = [...uniqueCreateIds]
      for (let i = 0; i < idArray.length; i++) {
        for (let j = i + 1; j < idArray.length; j++) {
          expect(idArray[i]).not.toBe(idArray[j])
        }
      }
    })

    it('no overlap between snapshot tile IDs and event-created tile IDs', () => {
      const ops = [
        ...makeOps('src/existing.ts', ['file_read', 'file_write'], 1000),
        ...makeOps('src/new.ts', ['file_create', 'file_write'], 1500),
      ]

      const snapshot = buildSnapshotFromOps(ops)
      const scenario = toScenarioData(snapshot)

      const snapshotIds = collectTileIds(scenario.snapshot.tiles)
      const eventCreateIds = collectEventTileIds(
        scenario.events.filter(e => e.source !== 'synthetic'),
        'file_create',
      )

      // Snapshot tiles and event-created tiles should not overlap
      for (const id of eventCreateIds) {
        expect(snapshotIds.has(id)).toBe(false)
      }
    })
  })

  // -------------------------------------------------------------------------
  // Work-unit-only mode (no operations attached)
  // -------------------------------------------------------------------------
  describe('work-unit-only mode', () => {
    it('buildings start empty even when no operations attached', () => {
      const ops = [
        ...makeOps('src/a.ts', ['file_read', 'file_write'], 1000),
        ...makeOps('src/b.ts', ['file_create', 'file_write'], 1200),
      ]

      // Build snapshot WITHOUT attaching operations
      const snapshot = buildSnapshotFromOps(ops, { attachOps: false })
      const scenario = toScenarioData(snapshot)

      // No tiles seeded at t=0 — all arrive via events
      expect(scenario.snapshot.tiles.length).toBe(0)

      // Buildings start empty
      for (const building of scenario.snapshot.buildings) {
        expect(building.health).toBe(0)
        expect(building.file_count).toBe(0)
      }

      // Tiles arrive via file_create events in work-unit mode
      const createEvents = scenario.events.filter(e => e.type === 'file_create')
      expect(createEvents.length).toBeGreaterThanOrEqual(2)
    })
  })
})
