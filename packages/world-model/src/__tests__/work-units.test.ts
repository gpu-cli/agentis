// ============================================================================
// World Model — Work Units, Output-Only Scoring, Size Bands (hq-gij.2.1)
// ============================================================================

import { describe, it, expect } from 'vitest'
import {
  computeOutputScore,
  deriveSizeBand,
  buildWorkUnits,
  computeFilesPerTile,
} from '../work-units'
import { sizeBandFootprint } from '../work-units'
import type { CanonicalOperation, ActorRef } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTOR_MAIN: ActorRef = { id: 'actor_main', kind: 'agent', parentId: null, name: 'Claude' }

function makeOp(overrides: Partial<CanonicalOperation> = {}): CanonicalOperation {
  return {
    id: 'op_test',
    timestamp: Date.now(),
    actor: ACTOR_MAIN,
    kind: 'file_write',
    targetPath: '/project/src/main.ts',
    repoRoot: '/project',
    branch: 'main',
    toolName: 'Write',
    summary: 'Write main.ts',
    rawRef: { file: 'session.jsonl', line: 1 },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// computeOutputScore — output-only scoring
// ---------------------------------------------------------------------------

describe('computeOutputScore', () => {
  it('scores based on editCount only', () => {
    const score = computeOutputScore({
      opCount: 0,
      editCount: 2,
      readCount: 1,
      commandCount: 1,
      errorCount: 0,
      actors: ['a'],
      lastTouched: 0,
    })
    expect(score).toBe(2)
  })

  it('ignores reads entirely', () => {
    const withReads = computeOutputScore({ opCount: 0, editCount: 5, readCount: 100, commandCount: 0, errorCount: 0, actors: [], lastTouched: 0 })
    const withoutReads = computeOutputScore({ opCount: 0, editCount: 5, readCount: 0, commandCount: 0, errorCount: 0, actors: [], lastTouched: 0 })
    expect(withReads).toBe(withoutReads)
  })

  it('ignores commands entirely', () => {
    const withCmds = computeOutputScore({ opCount: 0, editCount: 3, readCount: 0, commandCount: 50, errorCount: 0, actors: [], lastTouched: 0 })
    const withoutCmds = computeOutputScore({ opCount: 0, editCount: 3, readCount: 0, commandCount: 0, errorCount: 0, actors: [], lastTouched: 0 })
    expect(withCmds).toBe(withoutCmds)
  })

  it('ignores errors entirely', () => {
    const withErrors = computeOutputScore({ opCount: 0, editCount: 4, readCount: 0, commandCount: 0, errorCount: 10, actors: [], lastTouched: 0 })
    const withoutErrors = computeOutputScore({ opCount: 0, editCount: 4, readCount: 0, commandCount: 0, errorCount: 0, actors: [], lastTouched: 0 })
    expect(withErrors).toBe(withoutErrors)
  })

  it('ignores actor diversity entirely', () => {
    const oneActor = computeOutputScore({ opCount: 0, editCount: 1, readCount: 0, commandCount: 0, errorCount: 0, actors: ['a'], lastTouched: 0 })
    const twoActors = computeOutputScore({ opCount: 0, editCount: 1, readCount: 0, commandCount: 0, errorCount: 0, actors: ['a', 'b'], lastTouched: 0 })
    expect(oneActor).toBe(twoActors)
  })

  it('returns 0 for empty stats', () => {
    const score = computeOutputScore({ opCount: 0, editCount: 0, readCount: 0, commandCount: 0, errorCount: 0, actors: [], lastTouched: 0 })
    expect(score).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// deriveSizeBand
// ---------------------------------------------------------------------------

describe('deriveSizeBand', () => {
  it('returns S for score < 3', () => {
    expect(deriveSizeBand(0)).toBe('S')
    expect(deriveSizeBand(2)).toBe('S')
  })

  it('returns M for score 3-7', () => {
    expect(deriveSizeBand(3)).toBe('M')
    expect(deriveSizeBand(7)).toBe('M')
  })

  it('returns L for score 8-19', () => {
    expect(deriveSizeBand(8)).toBe('L')
    expect(deriveSizeBand(19)).toBe('L')
  })

  it('returns XL for score >= 20', () => {
    expect(deriveSizeBand(20)).toBe('XL')
    expect(deriveSizeBand(1000)).toBe('XL')
  })

  it('band thresholds are monotonically increasing', () => {
    const bands: Array<{ score: number; band: string }> = []
    for (let s = 0; s <= 50; s++) {
      bands.push({ score: s, band: deriveSizeBand(s) })
    }
    const order = ['S', 'M', 'L', 'XL']
    let lastIdx = 0
    for (const b of bands) {
      const idx = order.indexOf(b.band)
      expect(idx).toBeGreaterThanOrEqual(lastIdx)
      lastIdx = idx
    }
  })
})

// ---------------------------------------------------------------------------
// sizeBandFootprint
// ---------------------------------------------------------------------------

describe('sizeBandFootprint', () => {
  it('S → 2x2', () => {
    expect(sizeBandFootprint('S')).toEqual({ width: 2, height: 2 })
  })

  it('M → 3x2', () => {
    expect(sizeBandFootprint('M')).toEqual({ width: 3, height: 2 })
  })

  it('L → 3x3', () => {
    expect(sizeBandFootprint('L')).toEqual({ width: 3, height: 3 })
  })

  it('XL → 4x3', () => {
    expect(sizeBandFootprint('XL')).toEqual({ width: 4, height: 3 })
  })

  it('footprint area increases with band size', () => {
    const bands = ['S', 'M', 'L', 'XL'] as const
    const areas = bands.map(b => {
      const f = sizeBandFootprint(b)
      return f.width * f.height
    })
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i]).toBeGreaterThanOrEqual(areas[i - 1]!)
    }
  })
})

// ---------------------------------------------------------------------------
// computeFilesPerTile
// ---------------------------------------------------------------------------

describe('computeFilesPerTile', () => {
  it('returns 1 for small file counts', () => {
    expect(computeFilesPerTile(0)).toBe(1)
    expect(computeFilesPerTile(100)).toBe(1)
    expect(computeFilesPerTile(10_000)).toBe(1)
  })

  it('returns 10 for large file counts', () => {
    expect(computeFilesPerTile(10_001)).toBe(10)
    expect(computeFilesPerTile(50_000)).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// buildWorkUnits
// ---------------------------------------------------------------------------

describe('buildWorkUnits', () => {
  it('creates one work unit per unique file path (1:1 mode)', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op1', targetPath: '/project/src/main.ts', kind: 'file_write' }),
      makeOp({ id: 'op2', targetPath: '/project/src/utils.ts', kind: 'file_write' }),
      makeOp({ id: 'op3', targetPath: '/project/src/main.ts', kind: 'file_read' }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')

    expect(units.length).toBe(2) // main.ts and utils.ts (both have edits)
  })

  it('accumulates stats per file', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op1', targetPath: '/project/src/main.ts', kind: 'file_write' }),
      makeOp({ id: 'op2', targetPath: '/project/src/main.ts', kind: 'file_read' }),
      makeOp({ id: 'op3', targetPath: '/project/src/main.ts', kind: 'file_write' }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    const mainUnit = units.find(u => u.paths.includes('src/main.ts'))

    expect(mainUnit).toBeDefined()
    expect(mainUnit!.stats.editCount).toBe(2) // 2 writes
    expect(mainUnit!.stats.readCount).toBe(1) // 1 read
  })

  it('normalizes paths by stripping repo root', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ targetPath: '/project/src/main.ts', repoRoot: '/project' }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    expect(units[0]!.paths[0]).toBe('src/main.ts')
  })

  it('skips operations without targetPath', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ targetPath: null, kind: 'conversation' }),
      makeOp({ targetPath: '/project/src/main.ts', kind: 'file_write' }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    expect(units.length).toBe(1)
  })

  it('groups files by directory when filesPerTile > 1', () => {
    const ops: CanonicalOperation[] = []
    for (let i = 0; i < 20; i++) {
      ops.push(makeOp({
        id: `op${i}`,
        targetPath: `/project/src/file${i}.ts`,
        kind: 'file_write',
      }))
    }

    const units1 = buildWorkUnits(ops, 1, '/project')
    const units10 = buildWorkUnits(ops, 10, '/project')

    // 10-per-tile should have fewer units
    expect(units10.length).toBeLessThan(units1.length)
  })

  it('tracks actor diversity in stats', () => {
    const actorB: ActorRef = { id: 'actor_sub_1', kind: 'subagent', parentId: 'actor_main', name: 'Sub1' }
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op1', targetPath: '/project/src/main.ts', actor: ACTOR_MAIN }),
      makeOp({ id: 'op2', targetPath: '/project/src/main.ts', actor: actorB }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    expect(units[0]!.stats.actors.length).toBe(2)
  })

  it('tracks lastTouched as max timestamp', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op1', targetPath: '/project/src/main.ts', timestamp: 1000 }),
      makeOp({ id: 'op2', targetPath: '/project/src/main.ts', timestamp: 3000 }),
      makeOp({ id: 'op3', targetPath: '/project/src/main.ts', timestamp: 2000 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    expect(units[0]!.stats.lastTouched).toBe(3000)
  })

  it('generates deterministic IDs', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ targetPath: '/project/src/main.ts' }),
    ]

    const a = buildWorkUnits(ops, 1, '/project')
    const b = buildWorkUnits(ops, 1, '/project')

    expect(a[0]!.id).toBe(b[0]!.id)
    expect(a[0]!.id).toMatch(/^wu_/)
  })

  it('returns empty array for no operations', () => {
    expect(buildWorkUnits([], 1, '/project')).toEqual([])
  })

  it('counts command_run operations correctly', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op1', targetPath: '/project/src/main.ts', kind: 'file_write' }),
      makeOp({ id: 'op2', targetPath: '/project/src/main.ts', kind: 'command_run' }),
      makeOp({ id: 'op3', targetPath: '/project/src/main.ts', kind: 'command_run' }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    // File has an edit so it survives the read-only filter
    expect(units[0]!.stats.commandCount).toBe(2)
  })

  it('mass reflects output score (editCount only)', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op1', targetPath: '/project/src/main.ts', kind: 'file_write' }),
      makeOp({ id: 'op2', targetPath: '/project/src/main.ts', kind: 'file_write' }),
      makeOp({ id: 'op3', targetPath: '/project/src/main.ts', kind: 'file_read' }),
      makeOp({ id: 'op4', targetPath: '/project/src/main.ts', kind: 'command_run' }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    // mass should equal editCount (2), not be influenced by reads or commands
    expect(units[0]!.mass).toBe(2)
  })
})
