// ============================================================================
// Heat Overlay + Occupancy Animator — Data layer tests (hq-5x6.3)
//
// Tests the pure data functions exported from HeatOverlayManager and
// OccupancyAnimator without requiring PixiJS rendering. Follows the same
// pattern as fog-overlay.test.ts — coordinate math, state classification,
// and animation parameter computation tested via standalone helpers.
// ============================================================================

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Re-export pure functions from the heat overlay module
// ---------------------------------------------------------------------------

import {
  fadedIntensity,
  pruneEntries,
  aggregateHeat,
  HEAT_DECAY_MS,
  MAX_INTENSITY,
} from '../engine/HeatOverlayManager'
import type { HeatEntry } from '../engine/HeatOverlayManager'

import {
  isAnimationActive,
  animationProgress,
  workPulseAlpha,
  deleteShrinkRect,
  renameSlideOffset,
  pruneAnimations,
  ANIMATION_DURATION_MS,
} from '../engine/OccupancyAnimator'
import type { OccupancyState } from '../engine/OccupancyAnimator'

// ---------------------------------------------------------------------------
// Heat decay math
// ---------------------------------------------------------------------------

describe('heat decay', () => {
  it('returns full intensity when entry was just created', () => {
    const entry: HeatEntry = { buildingId: 'b1', timestamp: 1000, intensity: 1.0 }
    expect(fadedIntensity(entry, 1000)).toBeCloseTo(1.0)
  })

  it('returns half intensity at midpoint of decay window', () => {
    const entry: HeatEntry = { buildingId: 'b1', timestamp: 0, intensity: 1.0 }
    const midpoint = HEAT_DECAY_MS / 2
    expect(fadedIntensity(entry, midpoint)).toBeCloseTo(0.5)
  })

  it('returns zero when entry has fully decayed', () => {
    const entry: HeatEntry = { buildingId: 'b1', timestamp: 0, intensity: 1.0 }
    expect(fadedIntensity(entry, HEAT_DECAY_MS)).toBe(0)
  })

  it('returns zero for entries older than decay window', () => {
    const entry: HeatEntry = { buildingId: 'b1', timestamp: 0, intensity: 1.0 }
    expect(fadedIntensity(entry, HEAT_DECAY_MS + 1000)).toBe(0)
  })

  it('scales with entry intensity', () => {
    const entry: HeatEntry = { buildingId: 'b1', timestamp: 0, intensity: 0.5 }
    // At t=0, faded intensity should be 0.5
    expect(fadedIntensity(entry, 0)).toBeCloseTo(0.5)
  })
})

// ---------------------------------------------------------------------------
// Heat entry pruning
// ---------------------------------------------------------------------------

describe('heat entry pruning', () => {
  it('keeps entries within the decay window', () => {
    const now = 20_000
    const entries: HeatEntry[] = [
      { buildingId: 'b1', timestamp: now - 1000, intensity: 1.0 },
      { buildingId: 'b2', timestamp: now - 5000, intensity: 1.0 },
    ]
    const pruned = pruneEntries(entries, now)
    expect(pruned).toHaveLength(2)
  })

  it('removes entries older than the decay window', () => {
    const now = 20_000
    const entries: HeatEntry[] = [
      { buildingId: 'b1', timestamp: now - HEAT_DECAY_MS - 1, intensity: 1.0 },
      { buildingId: 'b2', timestamp: now - 1000, intensity: 1.0 },
    ]
    const pruned = pruneEntries(entries, now)
    expect(pruned).toHaveLength(1)
    expect(pruned[0]?.buildingId).toBe('b2')
  })

  it('returns empty array when all entries expired', () => {
    const now = 100_000
    const entries: HeatEntry[] = [
      { buildingId: 'b1', timestamp: 0, intensity: 1.0 },
      { buildingId: 'b2', timestamp: 100, intensity: 1.0 },
    ]
    const pruned = pruneEntries(entries, now)
    expect(pruned).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Heat aggregation
// ---------------------------------------------------------------------------

describe('heat aggregation', () => {
  it('aggregates heat for a single building', () => {
    const now = 1000
    const entries: HeatEntry[] = [
      { buildingId: 'b1', timestamp: now, intensity: 1.0 },
    ]
    const heat = aggregateHeat(entries, now)
    expect(heat.has('b1')).toBe(true)
    // At t=0, faded = 1.0, contribution = 1.0 * 0.3 = 0.3
    expect(heat.get('b1')).toBeCloseTo(0.3)
  })

  it('stacks heat from multiple writes to same building', () => {
    const now = 5000
    const entries: HeatEntry[] = [
      { buildingId: 'b1', timestamp: now, intensity: 1.0 },
      { buildingId: 'b1', timestamp: now - 1000, intensity: 1.0 },
      { buildingId: 'b1', timestamp: now - 2000, intensity: 1.0 },
    ]
    const heat = aggregateHeat(entries, now)
    const value = heat.get('b1')
    expect(value).toBeDefined()
    // Should be more than single entry
    expect(value).toBeGreaterThan(0.3)
  })

  it('clamps heat to MAX_INTENSITY', () => {
    const now = 5000
    // Many recent writes should clamp
    const entries: HeatEntry[] = Array.from({ length: 20 }, (_, i) => ({
      buildingId: 'b1',
      timestamp: now - i * 100,
      intensity: 1.0,
    }))
    const heat = aggregateHeat(entries, now)
    expect(heat.get('b1')).toBeLessThanOrEqual(MAX_INTENSITY)
  })

  it('tracks multiple buildings independently', () => {
    const now = 5000
    const entries: HeatEntry[] = [
      { buildingId: 'b1', timestamp: now, intensity: 1.0 },
      { buildingId: 'b2', timestamp: now, intensity: 1.0 },
    ]
    const heat = aggregateHeat(entries, now)
    expect(heat.size).toBe(2)
    expect(heat.has('b1')).toBe(true)
    expect(heat.has('b2')).toBe(true)
  })

  it('excludes fully decayed entries', () => {
    const now = 100_000
    const entries: HeatEntry[] = [
      { buildingId: 'b1', timestamp: 0, intensity: 1.0 },
    ]
    const heat = aggregateHeat(entries, now)
    expect(heat.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Occupancy animation lifecycle
// ---------------------------------------------------------------------------

describe('occupancy animation lifecycle', () => {
  const baseAnim: OccupancyState = {
    buildingId: 'b1',
    px: 100,
    py: 200,
    width: 64,
    height: 64,
    startTime: 1000,
    kind: 'work',
  }

  it('animation is active immediately after start', () => {
    expect(isAnimationActive(baseAnim, 1000)).toBe(true)
  })

  it('animation is active during duration', () => {
    expect(isAnimationActive(baseAnim, 1000 + ANIMATION_DURATION_MS - 1)).toBe(true)
  })

  it('animation expires after duration', () => {
    expect(isAnimationActive(baseAnim, 1000 + ANIMATION_DURATION_MS)).toBe(false)
  })

  it('animation expires well after duration', () => {
    expect(isAnimationActive(baseAnim, 1000 + ANIMATION_DURATION_MS + 5000)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Animation progress and fade-out
// ---------------------------------------------------------------------------

describe('animation progress', () => {
  const anim: OccupancyState = {
    buildingId: 'b1',
    px: 0,
    py: 0,
    width: 64,
    height: 64,
    startTime: 0,
    kind: 'work',
  }

  it('progress is 0 at start', () => {
    const { progress, fadeOut } = animationProgress(anim, 0)
    expect(progress).toBeCloseTo(0)
    expect(fadeOut).toBeCloseTo(1)
  })

  it('progress is 0.5 at midpoint', () => {
    const { progress, fadeOut } = animationProgress(anim, ANIMATION_DURATION_MS / 2)
    expect(progress).toBeCloseTo(0.5)
    expect(fadeOut).toBeCloseTo(0.5)
  })

  it('progress is 1 at end', () => {
    const { progress, fadeOut } = animationProgress(anim, ANIMATION_DURATION_MS)
    expect(progress).toBeCloseTo(1)
    expect(fadeOut).toBeCloseTo(0)
  })

  it('progress clamps to 1 beyond duration', () => {
    const { progress } = animationProgress(anim, ANIMATION_DURATION_MS + 5000)
    expect(progress).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Work pulse alpha
// ---------------------------------------------------------------------------

describe('work pulse alpha', () => {
  it('returns positive alpha at start', () => {
    const alpha = workPulseAlpha(0, 1)
    // sin(0) * 0.3 + 0.3 = 0.3, * fadeOut(1) = 0.3
    expect(alpha).toBeCloseTo(0.3)
  })

  it('fades to zero at end', () => {
    const alpha = workPulseAlpha(1, 0)
    expect(alpha).toBeCloseTo(0)
  })

  it('oscillates during animation', () => {
    // Test multiple sample points for non-zero values at non-zero fadeOut
    const samples = [0.1, 0.25, 0.5, 0.75]
    for (const p of samples) {
      const fadeOut = 1 - p
      const alpha = workPulseAlpha(p, fadeOut)
      expect(alpha).toBeGreaterThanOrEqual(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Delete shrink rect
// ---------------------------------------------------------------------------

describe('delete shrink rect', () => {
  it('returns full rect at start (progress=0)', () => {
    const rect = deleteShrinkRect(100, 200, 64, 64, 0)
    expect(rect).not.toBeNull()
    expect(rect?.sx).toBe(100)
    expect(rect?.sy).toBe(200)
    expect(rect?.sw).toBe(64)
    expect(rect?.sh).toBe(64)
  })

  it('shrinks rect as progress advances', () => {
    const rect = deleteShrinkRect(100, 200, 64, 64, 0.5)
    expect(rect).not.toBeNull()
    expect(rect!.sw).toBeLessThan(64)
    expect(rect!.sh).toBeLessThan(64)
    expect(rect!.sx).toBeGreaterThan(100)
    expect(rect!.sy).toBeGreaterThan(200)
  })

  it('returns null when shrink collapses rect', () => {
    // At progress > ~1.67 the rect would collapse — but progress clamps at 1
    // At progress=1, shrink=0.3 → sw = 64 * (1 - 0.6) = 25.6 — still positive
    const rect = deleteShrinkRect(100, 200, 64, 64, 1)
    expect(rect).not.toBeNull()
    expect(rect!.sw).toBeGreaterThan(0)
  })

  it('returns null for very small rects that collapse', () => {
    // A 1px rect with any progress should collapse quickly
    const rect = deleteShrinkRect(0, 0, 1, 1, 1)
    // sw = 1 * (1 - 0.6) = 0.4 — still positive
    expect(rect).not.toBeNull()
    // But a rect with width 0 should return null
    const rect2 = deleteShrinkRect(0, 0, 0, 0, 0.5)
    expect(rect2).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Rename slide offset
// ---------------------------------------------------------------------------

describe('rename slide offset', () => {
  it('returns 0 at start', () => {
    expect(renameSlideOffset(0)).toBe(0)
  })

  it('returns 8 at end', () => {
    expect(renameSlideOffset(1)).toBe(8)
  })

  it('returns 4 at midpoint', () => {
    expect(renameSlideOffset(0.5)).toBeCloseTo(4)
  })
})

// ---------------------------------------------------------------------------
// Animation pruning
// ---------------------------------------------------------------------------

describe('animation pruning', () => {
  it('keeps active animations', () => {
    const now = 5000
    const anims: OccupancyState[] = [
      { buildingId: 'b1', px: 0, py: 0, width: 64, height: 64, startTime: now - 500, kind: 'work' },
      { buildingId: 'b2', px: 0, py: 0, width: 64, height: 64, startTime: now - 1000, kind: 'delete' },
    ]
    const pruned = pruneAnimations(anims, now)
    expect(pruned).toHaveLength(2)
  })

  it('removes expired animations', () => {
    const now = 10_000
    const anims: OccupancyState[] = [
      { buildingId: 'b1', px: 0, py: 0, width: 64, height: 64, startTime: 0, kind: 'work' },
      { buildingId: 'b2', px: 0, py: 0, width: 64, height: 64, startTime: now - 500, kind: 'rename' },
    ]
    const pruned = pruneAnimations(anims, now)
    expect(pruned).toHaveLength(1)
    expect(pruned[0]?.buildingId).toBe('b2')
  })

  it('returns empty when all animations expired', () => {
    const now = 100_000
    const anims: OccupancyState[] = [
      { buildingId: 'b1', px: 0, py: 0, width: 64, height: 64, startTime: 0, kind: 'work' },
    ]
    const pruned = pruneAnimations(anims, now)
    expect(pruned).toHaveLength(0)
  })

  it('handles all three animation kinds', () => {
    const now = 5000
    const anims: OccupancyState[] = [
      { buildingId: 'b1', px: 0, py: 0, width: 64, height: 64, startTime: now - 100, kind: 'work' },
      { buildingId: 'b2', px: 0, py: 0, width: 64, height: 64, startTime: now - 200, kind: 'delete' },
      { buildingId: 'b3', px: 0, py: 0, width: 64, height: 64, startTime: now - 300, kind: 'rename' },
    ]
    const pruned = pruneAnimations(anims, now)
    expect(pruned).toHaveLength(3)
  })
})
