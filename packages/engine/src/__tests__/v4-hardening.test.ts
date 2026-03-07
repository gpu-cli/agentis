// ============================================================================
// V4 Hardening Tests — Corpus generation, soak loops, budget estimator (hq-dxz.7)
//
// Validates:
//  - Synthetic transcript generator at 2k / 10k / 100k events
//  - DiffCoalescer LWW correctness and memory stability under burst
//  - Budget estimator thresholds and tier classification
//  - Replay engine load → restart cycles without state leaks
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DiffCoalescer, chunk, basicEventDiagnostics } from '../replay/transport'
import type { DiffChange } from '../replay/diff'
import { ReplayEngine } from '../replay/engine'
import type { AgentEvent } from '@multiverse/shared'
import {
  estimateBudget,
  HEAP_BUDGET_WARN,
  MAX_TILES_WARN,
  MAX_TILES_HARD,
  MAX_EVENTS_WARN,
  MAX_EVENTS_HARD,
} from '@multiverse/world-model'
import type { PlanetSnapshot } from '@multiverse/shared'

// ---------------------------------------------------------------------------
// Synthetic corpus generator
// ---------------------------------------------------------------------------

const EVENT_TYPES: AgentEvent['type'][] = [
  'move', 'file_create', 'file_edit', 'file_delete', 'tool_use', 'task_complete',
]

function generateCorpus(count: number, agentCount = 3, buildingCount = 50): AgentEvent[] {
  const events: AgentEvent[] = []
  const baseTs = 1_700_000_000_000

  for (let i = 0; i < count; i++) {
    const agentIdx = i % agentCount
    const buildingIdx = i % buildingCount
    const typeIdx = i % EVENT_TYPES.length
    events.push({
      id: `evt_${i}`,
      schema_version: 1,
      dedupe_key: `gen:${i}`,
      agent_id: `agent_${agentIdx}`,
      planet_id: 'world_test',
      seq: i,
      timestamp: baseTs + i * 50, // 50ms spacing
      kind: 'mutation',
      type: EVENT_TYPES[typeIdx]!,
      source: 'synthetic',
      metadata: {},
      target: {
        building_id: `bldg_${buildingIdx}`,
        tile_id: `tile_${buildingIdx}_${i}`,
      },
    })
  }

  return events
}

function makeSnapshot(
  buildingCount: number,
  tileCount: number,
  agentCount: number,
): PlanetSnapshot {
  return {
    snapshot_version: 1,
    planet_id: 'world_test',
    planet_name: 'TestPlanet',
    islands: Array.from({ length: 1 }, (_, i) => ({
      id: `island_${i}`,
      name: `Island ${i}`,
      position: { chunk_x: 0, chunk_y: 0, local_x: 0, local_y: 0 },
      bounds: { width: 100, height: 100 },
      biome: 'grass' as const,
    })),
    districts: [],
    buildings: Array.from({ length: buildingCount }, (_, i) => ({
      id: `bldg_${i}`,
      name: `Building ${i}`,
      district_id: 'district_0',
      position: { chunk_x: 0, chunk_y: 0, local_x: i * 4, local_y: 0 },
      footprint: { width: 3, height: 3 },
      file_count: Math.ceil(tileCount / buildingCount),
      health: 50,
    })),
    tiles: Array.from({ length: tileCount }, (_, i) => ({
      id: `tile_${i}`,
      building_id: `bldg_${i % buildingCount}`,
      file_path: `/src/file_${i}.ts`,
      state: 'complete' as const,
      local_x: (i % 3),
      local_y: Math.floor(i / 3) % 3,
    })),
    agents: Array.from({ length: agentCount }, (_, i) => ({
      id: `agent_${i}`,
      name: `Agent ${i}`,
      position: { chunk_x: 0, chunk_y: 0, local_x: i * 2, local_y: 0 },
      color: '#00ff00',
    })),
    connections: [],
  } as unknown as PlanetSnapshot
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('V4 Hardening', () => {
  // ---- Corpus Generator ----

  describe('Synthetic corpus generator', () => {
    it('generates 2k events with correct structure', () => {
      const events = generateCorpus(2_000)
      expect(events.length).toBe(2_000)
      expect(events[0]!.id).toBe('evt_0')
      expect(events[1999]!.id).toBe('evt_1999')

      // All events have required fields
      for (const e of events) {
        expect(e.agent_id).toBeTruthy()
        expect(e.timestamp).toBeGreaterThan(0)
        expect(e.type).toBeTruthy()
      }
    })

    it('generates 10k events with distributed agents', () => {
      const events = generateCorpus(10_000, 5)
      expect(events.length).toBe(10_000)

      const agentIds = new Set(events.map(e => e.agent_id))
      expect(agentIds.size).toBe(5)
    })

    it('generates 100k events without OOM', () => {
      const events = generateCorpus(100_000)
      expect(events.length).toBe(100_000)

      // Timestamps are monotonically increasing
      for (let i = 1; i < events.length; i++) {
        expect(events[i]!.timestamp).toBeGreaterThanOrEqual(events[i - 1]!.timestamp)
      }
    })

    it('distributes event types across corpus', () => {
      const events = generateCorpus(600)
      const typeCounts = new Map<string, number>()
      for (const e of events) {
        typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1)
      }
      // All 6 types used
      expect(typeCounts.size).toBe(6)
      // Each type appears exactly 100 times in 600 events
      for (const count of typeCounts.values()) {
        expect(count).toBe(100)
      }
    })
  })

  // ---- DiffCoalescer soak ----

  describe('DiffCoalescer soak', () => {
    it('LWW: last write wins for same entity', () => {
      const c = new DiffCoalescer()
      c.add({ type: 'agent_move', id: 'a1', x: 0, y: 0 })
      c.add({ type: 'agent_move', id: 'a1', x: 10, y: 20 })
      c.add({ type: 'agent_move', id: 'a1', x: 50, y: 60 })

      const flushed = c.flush()
      expect(flushed.length).toBe(1)
      const move = flushed[0]! as { type: 'agent_move'; x: number; y: number }
      expect(move.x).toBe(50)
      expect(move.y).toBe(60)
    })

    it('preserves distinct entities', () => {
      const c = new DiffCoalescer()
      c.add({ type: 'agent_move', id: 'a1', x: 1, y: 2 })
      c.add({ type: 'agent_move', id: 'a2', x: 3, y: 4 })
      c.add({ type: 'building_stats', id: 'b1', file_count: 5, health: 80 })

      const flushed = c.flush()
      expect(flushed.length).toBe(3)
    })

    it('handles burst of 10k diffs without growing unbounded', () => {
      const c = new DiffCoalescer()

      // Simulate 10k rapid agent_move diffs for 100 agents
      for (let i = 0; i < 10_000; i++) {
        c.add({ type: 'agent_move', id: `a_${i % 100}`, x: i, y: i * 2 })
      }

      // Should coalesce to at most 100 entries (one per agent)
      expect(c.size).toBe(100)

      const flushed = c.flush()
      expect(flushed.length).toBe(100)
      expect(c.size).toBe(0) // cleared after flush
    })

    it('addAll coalesces correctly', () => {
      const c = new DiffCoalescer()
      const diffs: DiffChange[] = [
        { type: 'building_stats', id: 'b1', file_count: 1, health: 10 },
        { type: 'building_stats', id: 'b1', file_count: 5, health: 50 },
        { type: 'building_stats', id: 'b2', file_count: 3, health: 30 },
      ]
      c.addAll(diffs)

      const flushed = c.flush()
      expect(flushed.length).toBe(2) // b1 (LWW) + b2
      const b1 = flushed.find(d => d.type === 'building_stats' && d.id === 'b1')! as { file_count: number; health: number }
      expect(b1.file_count).toBe(5)
      expect(b1.health).toBe(50)
    })

    it('flush/refill cycles do not leak', () => {
      const c = new DiffCoalescer()

      for (let cycle = 0; cycle < 100; cycle++) {
        for (let i = 0; i < 50; i++) {
          c.add({ type: 'agent_move', id: `a_${i}`, x: cycle, y: cycle })
        }
        const flushed = c.flush()
        expect(flushed.length).toBe(50)
        expect(c.size).toBe(0)
      }
    })
  })

  // ---- Chunk helper ----

  describe('chunk helper', () => {
    it('splits events into correct sizes', () => {
      const events = generateCorpus(10_000)
      const chunks = chunk(events, 5_000)
      expect(chunks.length).toBe(2)
      expect(chunks[0]!.length).toBe(5_000)
      expect(chunks[1]!.length).toBe(5_000)
    })

    it('handles non-divisible sizes', () => {
      const events = generateCorpus(7)
      const chunks = chunk(events, 3)
      expect(chunks.length).toBe(3)
      expect(chunks[0]!.length).toBe(3)
      expect(chunks[1]!.length).toBe(3)
      expect(chunks[2]!.length).toBe(1)
    })

    it('handles empty array', () => {
      expect(chunk([], 100)).toEqual([])
    })
  })

  // ---- Event diagnostics ----

  describe('basicEventDiagnostics', () => {
    it('computes duration and avg delta', () => {
      const events = generateCorpus(100) // 50ms spacing
      const diag = basicEventDiagnostics(events)
      expect(diag.durationMs).toBe(99 * 50) // 4950ms
      expect(diag.avgDelta).toBeCloseTo(50, 0)
    })

    it('handles empty events', () => {
      const diag = basicEventDiagnostics([])
      expect(diag.durationMs).toBe(0)
      expect(diag.avgDelta).toBe(0)
    })

    it('handles single event', () => {
      const events = generateCorpus(1)
      const diag = basicEventDiagnostics(events)
      expect(diag.durationMs).toBe(0)
      expect(diag.avgDelta).toBe(0)
    })
  })

  // ---- Budget estimator thresholds ----

  describe('Budget estimator', () => {
    it('classifies small runs correctly', () => {
      const snapshot = makeSnapshot(5, 10, 1)
      const budget = estimateBudget(snapshot, 500)
      expect(budget.tier).toBe('small')
      expect(budget.warnings.length).toBe(0)
      expect(budget.canProceed).toBe(true)
    })

    it('classifies medium runs correctly', () => {
      const snapshot = makeSnapshot(20, 100, 3)
      const budget = estimateBudget(snapshot, 5_000)
      expect(budget.tier).toBe('medium')
      expect(budget.canProceed).toBe(true)
    })

    it('classifies large runs correctly', () => {
      const snapshot = makeSnapshot(100, 1000, 5)
      const budget = estimateBudget(snapshot, 50_000)
      expect(budget.tier).toBe('large')
    })

    it('classifies extreme runs correctly', () => {
      const snapshot = makeSnapshot(200, 2000, 10)
      const budget = estimateBudget(snapshot, 150_000)
      expect(budget.tier).toBe('extreme')
    })

    it('warns when events exceed soft limit', () => {
      const snapshot = makeSnapshot(10, 50, 2)
      const budget = estimateBudget(snapshot, MAX_EVENTS_WARN + 1)
      expect(budget.warnings.length).toBeGreaterThan(0)
      expect(budget.canProceed).toBe(true)
    })

    it('blocks when events exceed hard limit', () => {
      const snapshot = makeSnapshot(10, 50, 2)
      const budget = estimateBudget(snapshot, MAX_EVENTS_HARD + 1)
      expect(budget.warnings.length).toBeGreaterThan(0)
      expect(budget.canProceed).toBe(false)
    })

    it('warns when tiles exceed soft limit', () => {
      const snapshot = makeSnapshot(50, MAX_TILES_WARN + 1, 2)
      const budget = estimateBudget(snapshot, 1_000)
      const tileWarning = budget.warnings.find(w => w.includes('tiles'))
      expect(tileWarning).toBeTruthy()
      expect(budget.canProceed).toBe(true)
    })

    it('blocks when tiles exceed hard limit', () => {
      const snapshot = makeSnapshot(100, MAX_TILES_HARD + 1, 2)
      const budget = estimateBudget(snapshot, 1_000)
      expect(budget.canProceed).toBe(false)
    })

    it('estimates heap correctly', () => {
      const snapshot = makeSnapshot(10, 100, 2)
      const budget = estimateBudget(snapshot, 1_000)
      // Should be positive and reasonable
      expect(budget.estimatedHeapBytes).toBeGreaterThan(0)
      expect(budget.estimatedHeapBytes).toBeLessThan(HEAP_BUDGET_WARN)
    })

    it('counts entities correctly from snapshot', () => {
      const snapshot = makeSnapshot(15, 200, 4)
      const budget = estimateBudget(snapshot, 3_000)
      expect(budget.buildingCount).toBe(15)
      expect(budget.tileCount).toBe(200)
      expect(budget.agentCount).toBe(4)
      expect(budget.eventCount).toBe(3_000)
      expect(budget.islandCount).toBe(1)
    })
  })

  // ---- Replay engine soak (load → restart cycles) ----

  describe('Replay engine soak', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('handles 50 load → play → restart cycles without state leaks', () => {
      const dispatchedEvents: AgentEvent[] = []
      const stateHistory: { playbackState: string; currentEventIndex: number }[] = []

      const engine = new ReplayEngine({
        onEvent: (e) => dispatchedEvents.push(e),
        onStateChange: (s) => stateHistory.push({ playbackState: s.playbackState, currentEventIndex: s.currentEventIndex }),
      })

      const events = generateCorpus(100)

      for (let cycle = 0; cycle < 50; cycle++) {
        engine.load(events)
        engine.play()
        vi.advanceTimersByTime(500) // partial playback

        // Verify state is progressing
        const lastState = stateHistory[stateHistory.length - 1]!
        expect(lastState.playbackState).toBe('playing')
        expect(lastState.currentEventIndex).toBeGreaterThan(0)

        engine.restart()

        const resetState = stateHistory[stateHistory.length - 1]!
        expect(resetState.playbackState).toBe('idle')
        expect(resetState.currentEventIndex).toBe(0)
      }

      engine.dispose()
    })

    it('handles play to completion → restart → play to completion', () => {
      const dispatchedEvents: AgentEvent[] = []
      let lastState: { playbackState: string } | null = null

      const engine = new ReplayEngine({
        onEvent: (e) => dispatchedEvents.push(e),
        onStateChange: (s) => { lastState = { playbackState: s.playbackState } },
      })

      const events = generateCorpus(20)

      for (let cycle = 0; cycle < 10; cycle++) {
        engine.load(events)
        engine.play()
        vi.advanceTimersByTime(100_000) // complete all events

        expect(lastState!.playbackState).toBe('complete')
        expect(dispatchedEvents.length).toBe((cycle + 1) * 20)

        engine.restart()
        expect(lastState!.playbackState).toBe('idle')
      }

      engine.dispose()
    })

    it('speed changes during playback do not corrupt state', () => {
      const dispatchedEvents: AgentEvent[] = []
      let lastProgress = 0

      const engine = new ReplayEngine({
        onEvent: (e) => dispatchedEvents.push(e),
        onStateChange: (s) => { lastProgress = s.progress },
      })

      const events = generateCorpus(50)
      engine.load(events)
      engine.play()

      // Rapidly change speed
      for (let i = 0; i < 20; i++) {
        vi.advanceTimersByTime(100)
        engine.setSpeed(1 + (i % 10))
      }

      vi.advanceTimersByTime(100_000) // finish

      // Progress should have been reported during playback
      expect(lastProgress).toBeGreaterThanOrEqual(0)

      // All events dispatched exactly once, in order
      expect(dispatchedEvents.length).toBe(50)
      for (let i = 0; i < 50; i++) {
        expect(dispatchedEvents[i]!.seq).toBe(i)
      }

      engine.dispose()
    })

    it('pause/resume cycle preserves event ordering', () => {
      const dispatchedEvents: AgentEvent[] = []

      const engine = new ReplayEngine({
        onEvent: (e) => dispatchedEvents.push(e),
        onStateChange: () => {},
      })

      const events = generateCorpus(30)
      engine.load(events)

      // Play/pause rapidly
      for (let i = 0; i < 15; i++) {
        engine.play()
        vi.advanceTimersByTime(100)
        engine.pause()
        vi.advanceTimersByTime(50) // paused — no events should fire
      }

      // Resume and finish
      engine.play()
      vi.advanceTimersByTime(100_000)

      // Should have dispatched all 30, in order
      expect(dispatchedEvents.length).toBe(30)
      for (let i = 0; i < 30; i++) {
        expect(dispatchedEvents[i]!.seq).toBe(i)
      }

      engine.dispose()
    })
  })

  // ---- DiffCoalescer memory stability ----

  describe('DiffCoalescer memory stability', () => {
    it('1000 flush cycles with 100 entities stay bounded', () => {
      const c = new DiffCoalescer()

      for (let cycle = 0; cycle < 1000; cycle++) {
        // Simulate a frame's worth of diffs
        for (let i = 0; i < 100; i++) {
          c.add({ type: 'agent_move', id: `a_${i}`, x: cycle * 100 + i, y: i })
        }
        for (let i = 0; i < 50; i++) {
          c.add({ type: 'building_stats', id: `b_${i}`, file_count: cycle, health: 50 + (cycle % 50) })
        }

        const flushed = c.flush()
        // Should never exceed 150 entries (100 agents + 50 buildings)
        expect(flushed.length).toBeLessThanOrEqual(150)
        expect(c.size).toBe(0)
      }
    })
  })
})
