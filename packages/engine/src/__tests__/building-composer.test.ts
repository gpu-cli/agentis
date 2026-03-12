// ============================================================================
// BuildingComposer — Unit tests for compositional building tile generation
//
// Tests pure functions only — no PixiJS rendering.
// V2: Tests the type1/type2 building kit contract:
//   - Top row always has roof tiles + chimney
//   - Bottom row always has a door
//   - Middle rows are standard wall tiles
//   - All tiles use family='building' with type1/type2 material
// ============================================================================

import { describe, it, expect } from 'vitest'

import { composeBuilding } from '../engine/BuildingComposer'
import type { ComposedBuilding, TileAssignment } from '../engine/BuildingComposer'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count visible cells in a composed building */
function countVisible(cb: ComposedBuilding): number {
  let count = 0
  for (const row of cb.grid) {
    for (const cell of row) {
      if (cell.visible) count++
    }
  }
  return count
}

/** Flatten grid to array of visible cells */
function visibleCells(cb: ComposedBuilding): TileAssignment[] {
  const cells: TileAssignment[] = []
  for (const row of cb.grid) {
    for (const cell of row) {
      if (cell.visible) cells.push(cell)
    }
  }
  return cells
}

/** Check if a role is a roof role */
function isRoofRole(role: string): boolean {
  return role.startsWith('roof_')
}

/** Check if a role is a wall role */
function isWallRole(role: string): boolean {
  return role.startsWith('wall_')
}

// ---------------------------------------------------------------------------
// Grid dimensions
// ---------------------------------------------------------------------------

describe('composeBuilding grid dimensions', () => {
  it('produces grid matching footprint for 2×2 house', () => {
    const cb = composeBuilding({ width: 2, height: 2 }, 'house', 'urban', 100, 42)
    expect(cb.width).toBe(2)
    expect(cb.height).toBe(2)
    expect(cb.grid).toHaveLength(2)
    expect(cb.grid[0]).toHaveLength(2)
  })

  it('produces grid matching footprint for 3×3 large', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'large', 'library', 100, 99)
    expect(cb.width).toBe(3)
    expect(cb.height).toBe(3)
    expect(cb.grid).toHaveLength(3)
  })

  it('produces grid matching footprint for 4×3 tower', () => {
    const cb = composeBuilding({ width: 4, height: 3 }, 'tower', 'observatory', 100, 7)
    expect(cb.width).toBe(4)
    expect(cb.height).toBe(3)
  })

  it('handles 1×1 building', () => {
    const cb = composeBuilding({ width: 1, height: 1 }, 'house', 'urban', 100, 1)
    expect(cb.width).toBe(1)
    expect(cb.height).toBe(1)
    expect(cb.grid[0]![0]!.role).toBe('door')
  })
})

// ---------------------------------------------------------------------------
// Building kit material — all cells use type1 or type2
// ---------------------------------------------------------------------------

describe('building kit material', () => {
  it('all cells use type1 or type2 material', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, 42)
    for (const row of cb.grid) {
      for (const cell of row) {
        expect(['type1', 'type2']).toContain(cell.material)
      }
    }
  })

  it('all cells use building family', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, 42)
    for (const row of cb.grid) {
      for (const cell of row) {
        expect(cell.family).toBe('building')
      }
    }
  })

  it('urban biome uses type1 kit', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, 42)
    expect(cb.grid[0]![0]!.material).toBe('type1')
  })

  it('industrial biome uses type2 kit', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'industrial', 100, 42)
    expect(cb.grid[0]![0]!.material).toBe('type2')
  })

  it('biomes without kit preference use seed-based selection', () => {
    // arts biome has no buildingKit preference — seed decides
    const kits = new Set<string>()
    for (let seed = 0; seed < 10; seed++) {
      const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'arts', 100, seed)
      kits.add(cb.grid[0]![0]!.material)
    }
    expect(kits.size).toBe(2) // Both type1 and type2 appear
  })
})

// ---------------------------------------------------------------------------
// Roof row contract — top row always has roof tiles + chimney
// ---------------------------------------------------------------------------

describe('roof row contract', () => {
  it('3-tall building top row is all roof roles', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, 42)
    for (const cell of cb.grid[0]!) {
      expect(isRoofRole(cell.role)).toBe(true)
    }
  })

  it('3-tall building top row has exactly one chimney at rightmost position', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, 42)
    const roofRow = cb.grid[0]!
    const chimneyCount = roofRow.filter(c => c.role === 'roof_chimney').length
    expect(chimneyCount).toBe(1)
    expect(roofRow[roofRow.length - 1]!.role).toBe('roof_chimney')
  })

  it('2-tall building top row is all roof roles', () => {
    const cb = composeBuilding({ width: 2, height: 2 }, 'house', 'urban', 100, 42)
    for (const cell of cb.grid[0]!) {
      expect(isRoofRole(cell.role)).toBe(true)
    }
  })

  it('2-tall building has chimney at rightmost position', () => {
    const cb = composeBuilding({ width: 2, height: 2 }, 'house', 'urban', 100, 42)
    expect(cb.grid[0]![1]!.role).toBe('roof_chimney')
  })

  it('wide building has correct roof pattern: left, mid..., right, chimney', () => {
    const cb = composeBuilding({ width: 4, height: 3 }, 'house', 'urban', 100, 42)
    const roofRow = cb.grid[0]!
    expect(roofRow[0]!.role).toBe('roof_left')
    expect(roofRow[1]!.role).toBe('roof_mid')
    expect(roofRow[2]!.role).toBe('roof_right')
    expect(roofRow[3]!.role).toBe('roof_chimney')
  })

  it('1-wide 2-tall building roof has chimney only', () => {
    const cb = composeBuilding({ width: 1, height: 2 }, 'house', 'urban', 100, 42)
    expect(cb.grid[0]![0]!.role).toBe('roof_chimney')
  })

  it('industrial building has roof with chimney too', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'factory', 'industrial', 100, 42)
    const roofRow = cb.grid[0]!
    expect(isRoofRole(roofRow[0]!.role)).toBe(true)
    const chimneyCount = roofRow.filter(c => c.role === 'roof_chimney').length
    expect(chimneyCount).toBe(1)
  })

  it('tower building has roof with chimney', () => {
    const cb = composeBuilding({ width: 2, height: 3 }, 'server_tower', 'urban', 100, 42)
    const roofRow = cb.grid[0]!
    const chimneyCount = roofRow.filter(c => c.role === 'roof_chimney').length
    expect(chimneyCount).toBe(1)
  })

  it('chimney is present for all building sizes ≥ 2 tall', () => {
    const sizes = [
      { width: 2, height: 2 },
      { width: 3, height: 2 },
      { width: 3, height: 3 },
      { width: 4, height: 3 },
      { width: 2, height: 4 },
      { width: 1, height: 2 },
      { width: 1, height: 3 },
    ]
    for (const fp of sizes) {
      const cb = composeBuilding(fp, 'house', 'urban', 100, 42)
      const roofRow = cb.grid[0]!
      const chimneyCount = roofRow.filter(c => c.role === 'roof_chimney').length
      expect(chimneyCount, `${fp.width}×${fp.height} should have chimney`).toBe(1)
    }
  })
})

// ---------------------------------------------------------------------------
// Wall row contract — middle rows are wall tiles
// ---------------------------------------------------------------------------

describe('wall row contract', () => {
  it('middle rows of 3-tall building are all wall roles', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, 42)
    // Row 1 = wall
    for (const cell of cb.grid[1]!) {
      expect(isWallRole(cell.role)).toBe(true)
    }
  })

  it('wall row has left/mid/right pattern', () => {
    const cb = composeBuilding({ width: 4, height: 4 }, 'house', 'urban', 100, 42)
    // Rows 1 and 2 are wall rows
    for (const y of [1, 2]) {
      const wallRow = cb.grid[y]!
      expect(wallRow[0]!.role).toBe('wall_left')
      expect(wallRow[1]!.role).toBe('wall_mid')
      expect(wallRow[2]!.role).toBe('wall_mid')
      expect(wallRow[3]!.role).toBe('wall_right')
    }
  })

  it('single-width wall row uses wall_mid', () => {
    const cb = composeBuilding({ width: 1, height: 3 }, 'house', 'urban', 100, 42)
    expect(cb.grid[1]![0]!.role).toBe('wall_mid')
  })
})

// ---------------------------------------------------------------------------
// Base row — door contract
// ---------------------------------------------------------------------------

describe('base row door placement', () => {
  it('wide buildings have a door in the base row', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, 42)
    const baseRow = cb.grid[2]!
    const hasDoor = baseRow.some(cell => cell.role === 'door')
    expect(hasDoor).toBe(true)
  })

  it('institutional buildings have 2-wide door for width >= 4', () => {
    const cb = composeBuilding({ width: 4, height: 3 }, 'large', 'civic', 100, 42)
    const baseRow = cb.grid[2]!
    const doorCount = baseRow.filter(cell => cell.role === 'door').length
    expect(doorCount).toBe(2)
  })

  it('base row edges use wall_left and wall_right', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, 42)
    const baseRow = cb.grid[2]!
    expect(baseRow[0]!.role).toBe('wall_left')
    expect(baseRow[2]!.role).toBe('wall_right')
  })

  it('2-wide base row: wall_left + door', () => {
    const cb = composeBuilding({ width: 2, height: 2 }, 'house', 'urban', 100, 42)
    const baseRow = cb.grid[1]!
    expect(baseRow[0]!.role).toBe('wall_left')
    expect(baseRow[1]!.role).toBe('door')
  })

  it('1-wide base row: just a door', () => {
    const cb = composeBuilding({ width: 1, height: 2 }, 'house', 'urban', 100, 42)
    const baseRow = cb.grid[1]!
    expect(baseRow[0]!.role).toBe('door')
  })

  it('every building ≥ 1 tall has exactly one or more doors at base', () => {
    const sizes = [
      { width: 1, height: 1 },
      { width: 2, height: 2 },
      { width: 3, height: 3 },
      { width: 4, height: 3 },
      { width: 1, height: 3 },
    ]
    for (const fp of sizes) {
      const cb = composeBuilding(fp, 'house', 'urban', 100, 42)
      const baseRow = cb.grid[fp.height - 1]!
      const doorCount = baseRow.filter(c => c.role === 'door').length
      expect(doorCount, `${fp.width}×${fp.height} should have door(s)`).toBeGreaterThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// Health masking
// ---------------------------------------------------------------------------

describe('health masking', () => {
  it('100% health: all cells visible', () => {
    const cb = composeBuilding({ width: 2, height: 2 }, 'house', 'urban', 100, 42)
    expect(countVisible(cb)).toBe(4)
  })

  it('50% health: roughly half cells visible', () => {
    const cb = composeBuilding({ width: 2, height: 2 }, 'house', 'urban', 50, 42)
    expect(countVisible(cb)).toBe(2) // ceil(4 * 0.5) = 2
  })

  it('25% health: 1 of 4 cells visible', () => {
    const cb = composeBuilding({ width: 2, height: 2 }, 'house', 'urban', 25, 42)
    expect(countVisible(cb)).toBe(1) // ceil(4 * 0.25) = 1
  })

  it('0% health: no cells visible', () => {
    const cb = composeBuilding({ width: 2, height: 2 }, 'house', 'urban', 0, 42)
    expect(countVisible(cb)).toBe(0)
  })

  it('visible cells have positive alpha', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 60, 42)
    for (const cell of visibleCells(cb)) {
      expect(cell.alpha).toBeGreaterThan(0)
    }
  })

  it('invisible cells have zero alpha', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 60, 42)
    for (const row of cb.grid) {
      for (const cell of row) {
        if (!cell.visible) {
          expect(cell.alpha).toBe(0)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Material state
// ---------------------------------------------------------------------------

describe('material state', () => {
  it('ghost state reduces alpha of visible cells', () => {
    const solid = composeBuilding({ width: 2, height: 2 }, 'house', 'urban', 100, 42, 'solid')
    const ghost = composeBuilding({ width: 2, height: 2 }, 'house', 'urban', 100, 42, 'ghost')

    const solidAlpha = visibleCells(solid)[0]!.alpha
    const ghostAlpha = visibleCells(ghost)[0]!.alpha
    expect(ghostAlpha).toBeLessThan(solidAlpha)
  })
})

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

describe('overlays', () => {
  it('high-health buildings may generate overlays', () => {
    // Run many seeds to check at least one produces overlays
    let hasOverlays = false
    for (let seed = 0; seed < 50; seed++) {
      const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, seed)
      if (cb.overlays.length > 0) {
        hasOverlays = true
        break
      }
    }
    expect(hasOverlays).toBe(true)
  })

  it('low-health buildings get no overlays', () => {
    for (let seed = 0; seed < 20; seed++) {
      const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 30, seed)
      expect(cb.overlays).toHaveLength(0)
    }
  })

  it('chimney is NOT an overlay (it is a tile in the roof row)', () => {
    for (let seed = 0; seed < 50; seed++) {
      const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, seed)
      const chimneyOverlays = cb.overlays.filter(o => o.type === 'chimney')
      expect(chimneyOverlays).toHaveLength(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('same inputs produce identical output', () => {
    const a = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 75, 42)
    const b = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 75, 42)
    expect(a).toEqual(b)
  })

  it('different seeds may produce different kits', () => {
    // arts biome has no kit preference → seed-driven
    const materials = new Set<string>()
    for (let seed = 0; seed < 10; seed++) {
      const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'arts', 100, seed)
      materials.add(cb.grid[0]![0]!.material)
    }
    expect(materials.size).toBeGreaterThanOrEqual(2)
  })
})
