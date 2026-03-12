// ============================================================================
// Road Obstacle Avoidance — Tests that road tiles never overlap districts
// or buildings. Validates the rectsOverlap utility and the overall contract
// that connector roads only render between districts, not on top of them.
// ============================================================================

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Inline the rectsOverlap utility (same logic as TilemapManager.ts)
// ---------------------------------------------------------------------------

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  obstacles: { x: number; y: number; w: number; h: number }[],
): boolean {
  for (const b of obstacles) {
    if (a.x < b.x + b.w && a.x + a.w > b.x &&
        a.y < b.y + b.h && a.y + a.h > b.y) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// rectsOverlap utility
// ---------------------------------------------------------------------------

describe('rectsOverlap', () => {
  it('returns false when no obstacles', () => {
    const tile = { x: 10, y: 10, w: 20, h: 20 }
    expect(rectsOverlap(tile, [])).toBe(false)
  })

  it('returns true when tile fully inside obstacle', () => {
    const tile = { x: 15, y: 15, w: 5, h: 5 }
    const obstacle = { x: 10, y: 10, w: 20, h: 20 }
    expect(rectsOverlap(tile, [obstacle])).toBe(true)
  })

  it('returns true when tile partially overlaps obstacle', () => {
    const tile = { x: 25, y: 15, w: 10, h: 10 }
    const obstacle = { x: 10, y: 10, w: 20, h: 20 }
    expect(rectsOverlap(tile, [obstacle])).toBe(true)
  })

  it('returns false when tile is adjacent but not overlapping', () => {
    const tile = { x: 30, y: 10, w: 10, h: 10 }
    const obstacle = { x: 10, y: 10, w: 20, h: 20 }
    expect(rectsOverlap(tile, [obstacle])).toBe(false)
  })

  it('returns false when tile is clearly separated', () => {
    const tile = { x: 100, y: 100, w: 10, h: 10 }
    const obstacle = { x: 10, y: 10, w: 20, h: 20 }
    expect(rectsOverlap(tile, [obstacle])).toBe(false)
  })

  it('detects overlap with any obstacle in the list', () => {
    const tile = { x: 55, y: 15, w: 10, h: 10 }
    const obstacles = [
      { x: 10, y: 10, w: 20, h: 20 },
      { x: 50, y: 10, w: 20, h: 20 },
    ]
    expect(rectsOverlap(tile, obstacles)).toBe(true)
  })

  it('returns false when tile misses all obstacles', () => {
    const tile = { x: 35, y: 35, w: 5, h: 5 }
    const obstacles = [
      { x: 0, y: 0, w: 30, h: 30 },
      { x: 50, y: 50, w: 30, h: 30 },
    ]
    expect(rectsOverlap(tile, obstacles)).toBe(false)
  })

  it('edge-touching rects do NOT overlap (exclusive boundary)', () => {
    // Right edge of obstacle touches left edge of tile → not overlapping
    const tile = { x: 30, y: 10, w: 10, h: 10 }
    const obstacle = { x: 10, y: 10, w: 20, h: 20 }
    expect(rectsOverlap(tile, [obstacle])).toBe(false)

    // Bottom edge of obstacle touches top edge of tile → not overlapping
    const tile2 = { x: 10, y: 30, w: 10, h: 10 }
    expect(rectsOverlap(tile2, [obstacle])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Road tile filtering simulation — simulates the actual rendering logic
// to verify that road tiles between two districts never land on district rects
// ---------------------------------------------------------------------------

describe('road tiles between districts avoid obstacle rects', () => {
  // Simulate two districts side by side with a gap
  const districtA = { x: 0, y: 0, w: 100, h: 100 }
  const districtB = { x: 150, y: 0, w: 100, h: 100 }
  const obstacles = [districtA, districtB]

  it('road tiles in the gap between districts pass the filter', () => {
    // A road tile at x=110 (in the 50px gap between 100 and 150)
    const tile = { x: 110, y: 40, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(false)
  })

  it('road tiles inside district A are filtered out', () => {
    const tile = { x: 50, y: 40, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(true)
  })

  it('road tiles inside district B are filtered out', () => {
    const tile = { x: 180, y: 40, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(true)
  })

  it('road tiles at the district boundary edge are filtered out', () => {
    // A tile that partially overlaps the right edge of district A
    const tile = { x: 90, y: 40, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(true)
  })

  it('road tiles exactly at the gap boundary pass', () => {
    // Tile starts right at x=100 (end of district A)
    const tile = { x: 100, y: 40, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(false)
  })

  it('building inside district also blocks road tiles', () => {
    const building = { x: 60, y: 30, w: 32, h: 32 }
    const allObstacles = [...obstacles, building]
    // Tile overlapping the building
    const tile = { x: 65, y: 35, w: 10, h: 10 }
    expect(rectsOverlap(tile, allObstacles)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Vertically separated districts
// ---------------------------------------------------------------------------

describe('road tiles between vertically separated districts', () => {
  const districtTop = { x: 0, y: 0, w: 100, h: 80 }
  const districtBottom = { x: 0, y: 130, w: 100, h: 80 }
  const obstacles = [districtTop, districtBottom]

  it('road tiles in the vertical gap pass', () => {
    const tile = { x: 40, y: 90, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(false)
  })

  it('road tiles overlapping the top district are blocked', () => {
    const tile = { x: 40, y: 70, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(true)
  })

  it('road tiles overlapping the bottom district are blocked', () => {
    const tile = { x: 40, y: 125, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Endpoint-exclusion logic — simulates the fix where d1/d2 are excluded
// from the obstacle list so roads reach both district walls
// ---------------------------------------------------------------------------

describe('road tiles span between endpoint districts (d1/d2 excluded from obstacles)', () => {
  const d1 = { id: 'dist-1', rect: { x: 0, y: 0, w: 100, h: 100 } }
  const d2 = { id: 'dist-2', rect: { x: 200, y: 0, w: 100, h: 100 } }
  const thirdParty = { id: 'dist-3', rect: { x: 400, y: 0, w: 100, h: 100 } }

  // Simulate the fixed obstacle-building logic: exclude d1 and d2
  function buildObstacles(
    allDistricts: { id: string; rect: { x: number; y: number; w: number; h: number } }[],
    endpointIds: [string, string],
    buildings: { x: number; y: number; w: number; h: number }[] = [],
  ) {
    const rects: { x: number; y: number; w: number; h: number }[] = []
    for (const d of allDistricts) {
      if (d.id === endpointIds[0] || d.id === endpointIds[1]) continue
      rects.push(d.rect)
    }
    rects.push(...buildings)
    return rects
  }

  it('road tiles at d1 edge are NOT blocked when d1 is excluded', () => {
    const obstacles = buildObstacles([d1, d2, thirdParty], [d1.id, d2.id])
    // Tile right at d1's right edge (would be blocked before the fix)
    const tile = { x: 90, y: 40, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(false)
  })

  it('road tiles at d2 edge are NOT blocked when d2 is excluded', () => {
    const obstacles = buildObstacles([d1, d2, thirdParty], [d1.id, d2.id])
    // Tile right at d2's left edge
    const tile = { x: 195, y: 40, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(false)
  })

  it('road tiles inside d1 are NOT blocked (d1 excluded — tiles render up to walls)', () => {
    const obstacles = buildObstacles([d1, d2, thirdParty], [d1.id, d2.id])
    const tile = { x: 50, y: 40, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(false)
  })

  it('road tiles overlapping a third-party district ARE blocked', () => {
    const obstacles = buildObstacles([d1, d2, thirdParty], [d1.id, d2.id])
    const tile = { x: 420, y: 40, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(true)
  })

  it('buildings still block road tiles even when d1/d2 are excluded', () => {
    const building = { x: 130, y: 30, w: 40, h: 40 }
    const obstacles = buildObstacles([d1, d2, thirdParty], [d1.id, d2.id], [building])
    const tile = { x: 135, y: 35, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(true)
  })

  it('road tiles in gap between d1 and d2 pass when no third-party district blocks', () => {
    const obstacles = buildObstacles([d1, d2, thirdParty], [d1.id, d2.id])
    const tile = { x: 140, y: 40, w: 20, h: 20 }
    expect(rectsOverlap(tile, obstacles)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// seededJitter — deterministic jitter for district size variation
// ---------------------------------------------------------------------------

describe('seededJitter', () => {
  /** Inline the seededJitter utility (same logic as useScenarioReplay.ts) */
  function seededJitter(seed: number, offset: number, amount: number): number {
    const hash = Math.abs(((seed >>> 0) + offset * 6271) % 1000)
    return (hash / 500 - 1) * amount
  }

  it('returns a value within [-amount, +amount]', () => {
    for (let i = 0; i < 100; i++) {
      const val = seededJitter(42, i, 2)
      expect(val).toBeGreaterThanOrEqual(-2)
      expect(val).toBeLessThanOrEqual(2)
    }
  })

  it('is deterministic — same inputs produce same output', () => {
    const a = seededJitter(42, 7, 2)
    const b = seededJitter(42, 7, 2)
    expect(a).toBe(b)
  })

  it('different offsets produce different values (usually)', () => {
    const vals = new Set<number>()
    for (let i = 0; i < 20; i++) {
      vals.add(seededJitter(42, i, 2))
    }
    // At least some distinct values — not all the same
    expect(vals.size).toBeGreaterThan(1)
  })

  it('different seeds produce different values (usually)', () => {
    const a = seededJitter(100, 0, 2)
    const b = seededJitter(200, 0, 2)
    // Different seeds should usually give different results
    // (Could theoretically collide, but very unlikely for these inputs)
    expect(a).not.toBe(b)
  })

  it('amount=0 always returns 0', () => {
    expect(seededJitter(42, 5, 0)).toBeCloseTo(0)
    expect(seededJitter(99, 10, 0)).toBeCloseTo(0)
  })
})
