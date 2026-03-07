// ============================================================================
// DistrictParceler — Unit tests for district internal layout planning
//
// Tests pure functions only — no PixiJS rendering.
// ============================================================================

import { describe, it, expect } from 'vitest'

import { DistrictParceler } from '../engine/DistrictParceler'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockBuildings(count: number): { id: string; width: number; height: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `bld-${i}`,
    width: 2,
    height: 2,
  }))
}

// ---------------------------------------------------------------------------
// Basic layout generation
// ---------------------------------------------------------------------------

describe('DistrictParceler.plan', () => {
  it('returns a valid DistrictLayout', () => {
    const layout = DistrictParceler.plan(
      'district-1',
      { x: 0, y: 0, w: 16, h: 12 },
      mockBuildings(4),
      42,
    )

    expect(layout.districtId).toBe('district-1')
    expect(layout.roads).toBeDefined()
    expect(layout.parcels).toBeDefined()
    expect(layout.decorations).toBeDefined()
    expect(layout.gates).toBeDefined()
  })

  it('creates parcels for each building', () => {
    const buildings = mockBuildings(6)
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 20, h: 16 },
      buildings,
      42,
    )

    expect(layout.parcels).toHaveLength(6)
    for (let i = 0; i < buildings.length; i++) {
      expect(layout.parcels[i]!.buildingId).toBe(buildings[i]!.id)
    }
  })

  it('handles empty building list', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 16, h: 12 },
      [],
      42,
    )

    expect(layout.parcels).toHaveLength(0)
    expect(layout.roads).toBeDefined()
    expect(layout.gates.length).toBeGreaterThanOrEqual(2)
  })

  it('handles single building', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 10, h: 10 },
      [{ id: 'b1', width: 2, height: 2 }],
      42,
    )

    expect(layout.parcels).toHaveLength(1)
    expect(layout.parcels[0]!.buildingId).toBe('b1')
  })
})

// ---------------------------------------------------------------------------
// Road spine
// ---------------------------------------------------------------------------

describe('road spine', () => {
  it('generates at least 2 gates', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 16, h: 12 },
      mockBuildings(4),
      42,
    )

    expect(layout.gates.length).toBeGreaterThanOrEqual(2)
  })

  it('main road has at least 2 waypoints', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 16, h: 12 },
      mockBuildings(4),
      42,
    )

    expect(layout.roads.main.length).toBeGreaterThanOrEqual(2)
  })

  it('wide districts get horizontal main road', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 20, h: 8 },
      mockBuildings(4),
      42,
    )

    // Main road should be roughly horizontal: y values similar, x values differ
    const main = layout.roads.main
    expect(main.length).toBeGreaterThanOrEqual(2)
    // First and last waypoints should differ in x more than y
    const dx = Math.abs(main[main.length - 1]!.x - main[0]!.x)
    const dy = Math.abs(main[main.length - 1]!.y - main[0]!.y)
    expect(dx).toBeGreaterThanOrEqual(dy)
  })

  it('tall districts get vertical main road', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 8, h: 20 },
      mockBuildings(4),
      42,
    )

    const main = layout.roads.main
    expect(main.length).toBeGreaterThanOrEqual(2)
    const dx = Math.abs(main[main.length - 1]!.x - main[0]!.x)
    const dy = Math.abs(main[main.length - 1]!.y - main[0]!.y)
    expect(dy).toBeGreaterThanOrEqual(dx)
  })

  it('gate directions match the spine direction', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 20, h: 8 },
      mockBuildings(4),
      42,
    )

    // Horizontal district should have W and E gates
    const directions = layout.gates.map(g => g.direction)
    expect(directions).toContain('w')
    expect(directions).toContain('e')
  })
})

// ---------------------------------------------------------------------------
// Parcel bounds
// ---------------------------------------------------------------------------

describe('parcel bounds', () => {
  it('all building parcels are within district bounds (clamped)', () => {
    const bounds = { x: 0, y: 0, w: 20, h: 16 }
    const layout = DistrictParceler.plan(
      'd1',
      bounds,
      mockBuildings(8),
      42,
    )

    for (const parcel of layout.parcels) {
      // Buildable area should be within bounds
      // (may be clamped to edges for tight layouts)
      expect(parcel.buildable.x).toBeGreaterThanOrEqual(bounds.x)
      expect(parcel.buildable.y).toBeGreaterThanOrEqual(bounds.y)
      expect(parcel.buildable.x + parcel.buildable.w).toBeLessThanOrEqual(bounds.x + bounds.w)
      expect(parcel.buildable.y + parcel.buildable.h).toBeLessThanOrEqual(bounds.y + bounds.h)
    }
  })

  it('parcels have valid facing directions', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 20, h: 16 },
      mockBuildings(6),
      42,
    )

    const validDirections = ['n', 's', 'e', 'w']
    for (const parcel of layout.parcels) {
      expect(validDirections).toContain(parcel.facing)
    }
  })

  it('buildable area is smaller than parcel bounds (setback)', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 20, h: 16 },
      mockBuildings(4),
      42,
    )

    for (const parcel of layout.parcels) {
      expect(parcel.buildable.w).toBeLessThanOrEqual(parcel.bounds.w)
      expect(parcel.buildable.h).toBeLessThanOrEqual(parcel.bounds.h)
    }
  })

  it('parcel buildable dimensions match building footprint', () => {
    const buildings = [
      { id: 'b1', width: 2, height: 2 },
      { id: 'b2', width: 3, height: 2 },
      { id: 'b3', width: 3, height: 3 },
    ]
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 30, h: 20 },
      buildings,
      42,
    )

    for (let i = 0; i < buildings.length; i++) {
      expect(layout.parcels[i]!.buildable.w).toBe(buildings[i]!.width)
      expect(layout.parcels[i]!.buildable.h).toBe(buildings[i]!.height)
    }
  })
})

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

describe('decorations', () => {
  it('generates decorations in open areas', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 20, h: 16 },
      mockBuildings(2), // few buildings → more open space
      42,
    )

    expect(layout.decorations.length).toBeGreaterThan(0)
  })

  it('decoration items have valid families and roles', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 20, h: 16 },
      mockBuildings(2),
      42,
    )

    for (const decor of layout.decorations) {
      expect(decor.family).toBe('decoration')
      expect(decor.material).toBe('default')
      expect(decor.role).toBeTruthy()
    }
  })

  it('decorations are not inside parcel bounds', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 20, h: 16 },
      mockBuildings(4),
      42,
    )

    for (const decor of layout.decorations) {
      for (const parcel of layout.parcels) {
        const inside =
          decor.x >= parcel.bounds.x &&
          decor.x < parcel.bounds.x + parcel.bounds.w &&
          decor.y >= parcel.bounds.y &&
          decor.y < parcel.bounds.y + parcel.bounds.h
        expect(inside, `Decoration at (${decor.x}, ${decor.y}) inside parcel`).toBe(false)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('same inputs produce identical output', () => {
    const bounds = { x: 0, y: 0, w: 16, h: 12 }
    const buildings = mockBuildings(4)

    const a = DistrictParceler.plan('d1', bounds, buildings, 42)
    const b = DistrictParceler.plan('d1', bounds, buildings, 42)

    expect(a).toEqual(b)
  })

  it('different seeds produce different layouts', () => {
    const bounds = { x: 0, y: 0, w: 16, h: 12 }
    const buildings = mockBuildings(4)

    const a = DistrictParceler.plan('d1', bounds, buildings, 42)
    const b = DistrictParceler.plan('d1', bounds, buildings, 999)

    // Road spine jitter should differ
    const mainA = JSON.stringify(a.roads.main)
    const mainB = JSON.stringify(b.roads.main)
    // They may sometimes be the same due to integer rounding, but decorations should differ
    const decA = JSON.stringify(a.decorations)
    const decB = JSON.stringify(b.decorations)
    expect(mainA !== mainB || decA !== decB).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles very small district', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 4, h: 4 },
      [{ id: 'tiny', width: 1, height: 1 }],
      42,
    )

    expect(layout.parcels).toHaveLength(1)
    expect(layout.roads.main.length).toBeGreaterThanOrEqual(2)
  })

  it('handles many buildings in small district', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 0, y: 0, w: 10, h: 10 },
      mockBuildings(20),
      42,
    )

    // Should not crash — parcels are clamped within bounds
    expect(layout.parcels).toHaveLength(20)
  })

  it('handles offset district bounds', () => {
    const layout = DistrictParceler.plan(
      'd1',
      { x: 100, y: 200, w: 16, h: 12 },
      mockBuildings(4),
      42,
    )

    // Gates should be at district edges
    for (const gate of layout.gates) {
      const onEdge =
        gate.x === 100 || gate.x === 116 ||
        gate.y === 200 || gate.y === 212
      expect(onEdge, `Gate at (${gate.x}, ${gate.y}) should be on edge of bounds`).toBe(true)
    }
  })
})
