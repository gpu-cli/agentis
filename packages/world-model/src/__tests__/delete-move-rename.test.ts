// ============================================================================
// World Model — Delete/Move/Rename Semantics (hq-gij.2.2)
// ============================================================================

import { describe, it, expect } from 'vitest'
import { buildWorkUnits, computeOutputScore } from '../work-units'
import type { CanonicalOperation, ActorRef } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTOR: ActorRef = { id: 'actor_main', kind: 'agent', parentId: null, name: 'Claude' }

function makeOp(overrides: Partial<CanonicalOperation> = {}): CanonicalOperation {
  return {
    id: 'op_test',
    timestamp: Date.now(),
    actor: ACTOR,
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
// Delete semantics
// ---------------------------------------------------------------------------

describe('delete semantics', () => {
  it('file_delete increments editCount and sets deletedMarker', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', kind: 'file_delete', targetPath: '/project/src/old.ts' }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    expect(units.length).toBe(1)
    expect(units[0]!.stats.editCount).toBe(1)
    expect(units[0]!.stats.deletedMarker).toBe(true)
  })

  it('deleted file still appears as a work unit with deletedMarker', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', kind: 'file_write', targetPath: '/project/src/temp.ts', timestamp: 1000 }),
      makeOp({ id: 'op_2', kind: 'file_delete', targetPath: '/project/src/temp.ts', timestamp: 2000 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    const tempUnit = units.find(u => u.paths.includes('src/temp.ts'))
    expect(tempUnit).toBeTruthy()
    // Both write and delete count as edits
    expect(tempUnit!.stats.editCount).toBe(2)
    // Last op is delete → deletedMarker is true
    expect(tempUnit!.stats.deletedMarker).toBe(true)
  })

  it('delete contributes to output score via editCount', () => {
    const statsWithDelete = {
      opCount: 1, editCount: 1, readCount: 0, commandCount: 0,
      lastTouched: 0, actors: ['a'], errorCount: 0,
    }
    const statsWithoutDelete = {
      opCount: 1, editCount: 0, readCount: 0, commandCount: 0,
      lastTouched: 0, actors: ['a'], errorCount: 0,
    }

    expect(computeOutputScore(statsWithDelete)).toBeGreaterThan(computeOutputScore(statsWithoutDelete))
  })

  it('file deleted then recreated has deletedMarker false', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', kind: 'file_create', targetPath: '/project/src/revived.ts', timestamp: 1000 }),
      makeOp({ id: 'op_2', kind: 'file_delete', targetPath: '/project/src/revived.ts', timestamp: 2000 }),
      makeOp({ id: 'op_3', kind: 'file_create', targetPath: '/project/src/revived.ts', timestamp: 3000 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    const unit = units.find(u => u.paths.includes('src/revived.ts'))
    expect(unit).toBeTruthy()
    expect(unit!.stats.editCount).toBe(3)
    // Last op is create → deletedMarker is false
    expect(unit!.stats.deletedMarker).toBe(false)
  })

  it('file_create also increments editCount', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', kind: 'file_create', targetPath: '/project/src/new.ts' }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    expect(units[0]!.stats.editCount).toBe(1)
  })

  it('create → delete cycle results in 3 edits with deletedMarker', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', kind: 'file_create', targetPath: '/project/src/ephemeral.ts', timestamp: 1000 }),
      makeOp({ id: 'op_2', kind: 'file_write', targetPath: '/project/src/ephemeral.ts', timestamp: 2000 }),
      makeOp({ id: 'op_3', kind: 'file_delete', targetPath: '/project/src/ephemeral.ts', timestamp: 3000 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    const unit = units.find(u => u.paths.includes('src/ephemeral.ts'))
    expect(unit).toBeTruthy()
    expect(unit!.stats.editCount).toBe(3)
    expect(unit!.stats.opCount).toBe(3)
    // Last op is delete → deletedMarker is true
    expect(unit!.stats.deletedMarker).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Move / rename semantics
// ---------------------------------------------------------------------------

describe('move/rename semantics', () => {
  it('old and new paths create separate work units', () => {
    // Current behavior: rename = delete(old) + create(new) → 2 separate work units
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', kind: 'file_write', targetPath: '/project/src/old-name.ts', timestamp: 1000 }),
      makeOp({ id: 'op_2', kind: 'file_delete', targetPath: '/project/src/old-name.ts', timestamp: 2000 }),
      makeOp({ id: 'op_3', kind: 'file_create', targetPath: '/project/src/new-name.ts', timestamp: 2001 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    const oldUnit = units.find(u => u.paths.includes('src/old-name.ts'))
    const newUnit = units.find(u => u.paths.includes('src/new-name.ts'))

    expect(oldUnit).toBeTruthy()
    expect(newUnit).toBeTruthy()
    expect(oldUnit!.id).not.toBe(newUnit!.id)
  })

  it('move to different directory with matching basename merges stats', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', kind: 'file_write', targetPath: '/project/src/utils.ts', timestamp: 1000 }),
      makeOp({ id: 'op_2', kind: 'file_delete', targetPath: '/project/src/utils.ts', timestamp: 2000 }),
      makeOp({ id: 'op_3', kind: 'file_create', targetPath: '/project/lib/utils.ts', timestamp: 2001 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    // Rename detected (same basename, same actor, within 5s) → old path merged into new
    const srcUnit = units.find(u => u.paths.includes('src/utils.ts'))
    const libUnit = units.find(u => u.paths.includes('lib/utils.ts'))

    expect(srcUnit).toBeUndefined()
    expect(libUnit).toBeTruthy()
    // Old file's stats merged: 1 write + 1 delete + 1 create = 3 edits
    expect(libUnit!.stats.editCount).toBe(3)
    expect(libUnit!.stats.deletedMarker).toBe(false)
  })

  it('preserves operation history when basenames differ (no rename detection)', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', kind: 'file_write', targetPath: '/project/src/comp.tsx', timestamp: 1000 }),
      makeOp({ id: 'op_2', kind: 'file_read', targetPath: '/project/src/comp.tsx', timestamp: 1500 }),
      makeOp({ id: 'op_3', kind: 'file_delete', targetPath: '/project/src/comp.tsx', timestamp: 2000 }),
      makeOp({ id: 'op_4', kind: 'file_create', targetPath: '/project/src/component.tsx', timestamp: 2001 }),
      makeOp({ id: 'op_5', kind: 'file_write', targetPath: '/project/src/component.tsx', timestamp: 3000 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    const oldUnit = units.find(u => u.paths.includes('src/comp.tsx'))
    const newUnit = units.find(u => u.paths.includes('src/component.tsx'))

    // Different basenames → no rename detection → both units exist separately
    // Old path: 1 write + 1 delete = 2 edits, 1 read
    expect(oldUnit!.stats.editCount).toBe(2)
    expect(oldUnit!.stats.readCount).toBe(1)
    expect(oldUnit!.stats.deletedMarker).toBe(true)

    // New path: 1 create + 1 write = 2 edits
    expect(newUnit!.stats.editCount).toBe(2)
    expect(newUnit!.stats.deletedMarker).toBe(false)
  })

  it('rename detection merges stats when same basename, same actor, within 5s', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', kind: 'file_write', targetPath: '/project/src/helper.ts', timestamp: 1000 }),
      makeOp({ id: 'op_2', kind: 'file_read', targetPath: '/project/src/helper.ts', timestamp: 1500 }),
      makeOp({ id: 'op_3', kind: 'file_delete', targetPath: '/project/src/helper.ts', timestamp: 2000 }),
      makeOp({ id: 'op_4', kind: 'file_create', targetPath: '/project/lib/helper.ts', timestamp: 2001 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    const oldUnit = units.find(u => u.paths.includes('src/helper.ts'))
    const newUnit = units.find(u => u.paths.includes('lib/helper.ts'))

    // Same basename (helper.ts), same actor, within 5s → rename detected
    expect(oldUnit).toBeUndefined()
    expect(newUnit).toBeTruthy()
    // Merged stats: 1 write + 1 delete + 1 create = 3 edits, 1 read
    expect(newUnit!.stats.editCount).toBe(3)
    expect(newUnit!.stats.readCount).toBe(1)
    expect(newUnit!.stats.deletedMarker).toBe(false)
  })

  it('no rename detection when different actors perform delete and create', () => {
    const actor2: ActorRef = { id: 'actor_other', kind: 'agent', parentId: null, name: 'Other' }
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', kind: 'file_write', targetPath: '/project/src/shared.ts', timestamp: 1000 }),
      makeOp({ id: 'op_2', kind: 'file_delete', targetPath: '/project/src/shared.ts', timestamp: 2000 }),
      makeOp({ id: 'op_3', kind: 'file_create', targetPath: '/project/lib/shared.ts', timestamp: 2001, actor: actor2 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    const srcUnit = units.find(u => u.paths.includes('src/shared.ts'))
    const libUnit = units.find(u => u.paths.includes('lib/shared.ts'))

    // Different actors → no rename detection → both units exist
    expect(srcUnit).toBeTruthy()
    expect(libUnit).toBeTruthy()
    expect(srcUnit!.stats.deletedMarker).toBe(true)
    expect(libUnit!.stats.deletedMarker).toBe(false)
  })

  it('no rename detection when time gap exceeds 5 seconds', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', kind: 'file_write', targetPath: '/project/src/config.ts', timestamp: 1000 }),
      makeOp({ id: 'op_2', kind: 'file_delete', targetPath: '/project/src/config.ts', timestamp: 2000 }),
      makeOp({ id: 'op_3', kind: 'file_create', targetPath: '/project/lib/config.ts', timestamp: 10000 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    const srcUnit = units.find(u => u.paths.includes('src/config.ts'))
    const libUnit = units.find(u => u.paths.includes('lib/config.ts'))

    // Time gap 8000ms > 5000ms → no rename detection → both units exist
    expect(srcUnit).toBeTruthy()
    expect(libUnit).toBeTruthy()
    expect(srcUnit!.stats.deletedMarker).toBe(true)
    expect(libUnit!.stats.deletedMarker).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Path normalization for moves
// ---------------------------------------------------------------------------

describe('path normalization', () => {
  it('strips repo root from absolute paths', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', targetPath: '/project/src/main.ts', repoRoot: '/project' }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    expect(units[0]!.paths[0]).toBe('src/main.ts')
  })

  it('handles Windows-style backslashes', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', targetPath: 'C:\\project\\src\\main.ts', repoRoot: 'C:\\project' }),
    ]

    const units = buildWorkUnits(ops, 1, 'C:\\project')
    expect(units[0]!.paths[0]).toBe('src/main.ts')
  })

  it('groups same file from different absolute paths to same work unit', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', targetPath: '/project/src/api.ts', repoRoot: '/project', timestamp: 1000 }),
      makeOp({ id: 'op_2', targetPath: '/project/src/api.ts', repoRoot: '/project', timestamp: 2000 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    const apiUnits = units.filter(u => u.paths.includes('src/api.ts'))
    expect(apiUnits.length).toBe(1)
    expect(apiUnits[0]!.stats.opCount).toBe(2)
  })

  it('skips operations with empty normalized path', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', targetPath: '/project', repoRoot: '/project' }),
    ]

    // After stripping root and leading slash, path is empty → skipped
    const units = buildWorkUnits(ops, 1, '/project')
    expect(units.length).toBe(0)
  })

  it('skips operations with null targetPath', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', targetPath: null as unknown as string }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    expect(units.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Branch tracking during moves
// ---------------------------------------------------------------------------

describe('branch tracking during file operations', () => {
  it('updates branch to latest operation', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', targetPath: '/project/src/file.ts', branch: 'main', timestamp: 1000 }),
      makeOp({ id: 'op_2', targetPath: '/project/src/file.ts', branch: 'feature/x', timestamp: 2000 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    expect(units[0]!.branch).toBe('feature/x')
  })

  it('keeps branch when later op has null branch', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', targetPath: '/project/src/file.ts', branch: 'feature/y', timestamp: 1000 }),
      makeOp({ id: 'op_2', targetPath: '/project/src/file.ts', branch: null, timestamp: 2000 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    // null branch doesn't overwrite existing branch
    expect(units[0]!.branch).toBe('feature/y')
  })

  it('tracks actors across file operations', () => {
    const actor2: ActorRef = { id: 'actor_sub', kind: 'subagent', parentId: 'actor_main', name: 'Sub' }
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', targetPath: '/project/src/shared.ts', actor: ACTOR, timestamp: 1000 }),
      makeOp({ id: 'op_2', targetPath: '/project/src/shared.ts', actor: actor2, timestamp: 2000 }),
    ]

    const units = buildWorkUnits(ops, 1, '/project')
    expect(units[0]!.stats.actors).toContain('actor_main')
    expect(units[0]!.stats.actors).toContain('actor_sub')
    expect(units[0]!.stats.actors.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// filesPerTile grouping with moves
// ---------------------------------------------------------------------------

describe('filesPerTile grouping', () => {
  it('groups files in same directory when filesPerTile > 1', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', targetPath: '/project/src/a.ts', timestamp: 1000 }),
      makeOp({ id: 'op_2', targetPath: '/project/src/b.ts', timestamp: 2000 }),
      makeOp({ id: 'op_3', targetPath: '/project/src/c.ts', timestamp: 3000 }),
    ]

    const units = buildWorkUnits(ops, 2, '/project')
    // 3 files in src/ with filesPerTile=2 → 2 work units (2+1)
    expect(units.length).toBe(2)
  })

  it('keeps files from different directories separate', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', targetPath: '/project/src/a.ts', timestamp: 1000 }),
      makeOp({ id: 'op_2', targetPath: '/project/tests/b.ts', timestamp: 2000 }),
    ]

    const units = buildWorkUnits(ops, 5, '/project')
    // Different directories → separate buckets even with large filesPerTile
    expect(units.length).toBe(2)
  })

  it('merges stats when grouping files', () => {
    const ops: CanonicalOperation[] = [
      makeOp({ id: 'op_1', kind: 'file_write', targetPath: '/project/src/a.ts', timestamp: 1000 }),
      makeOp({ id: 'op_2', kind: 'file_write', targetPath: '/project/src/b.ts', timestamp: 2000 }),
      makeOp({ id: 'op_3', kind: 'file_read', targetPath: '/project/src/b.ts', timestamp: 2100 }),
    ]

    const units = buildWorkUnits(ops, 5, '/project')
    // Both files have edits → both survive read-only filter → grouped into one unit
    expect(units.length).toBe(1)
    expect(units[0]!.stats.editCount).toBe(2)
    expect(units[0]!.stats.readCount).toBe(1)
    expect(units[0]!.stats.opCount).toBe(3)
  })
})
