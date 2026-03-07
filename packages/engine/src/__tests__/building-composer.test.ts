// ============================================================================
// BuildingComposer — Unit tests for compositional building tile generation
//
// Tests pure functions only — no PixiJS rendering.
// ============================================================================

import { describe, it, expect } from 'vitest'

import { composeBuilding } from '../engine/BuildingComposer'
import type { ComposedBuilding, TileAssignment } from '../engine/BuildingComposer'

// ---------------------------------------------------------------------------
// Helper
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
// Zone decomposition
// ---------------------------------------------------------------------------

describe('zone decomposition', () => {
  it('residential 3-tall building has roof, walls, and base', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, 42)

    // Row 0 = roof
    for (const cell of cb.grid[0]!) {
      expect(cell.family).toBe('roof')
    }
    // Row 1 = wall
    for (const cell of cb.grid[1]!) {
      expect(cell.family).toBe('building')
    }
    // Row 2 = base
    for (const cell of cb.grid[2]!) {
      expect(cell.family).toBe('building')
    }
  })

  it('industrial building has flat roof (wall family)', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'factory', 'industrial', 100, 42)
    // Row 0 = flat roof (still 'building' family)
    for (const cell of cb.grid[0]!) {
      expect(cell.family).toBe('building')
    }
  })

  it('2-tall residential has roof + base', () => {
    const cb = composeBuilding({ width: 2, height: 2 }, 'house', 'urban', 100, 42)
    // Row 0 = roof
    for (const cell of cb.grid[0]!) {
      expect(cell.family).toBe('roof')
    }
    // Row 1 = base
    for (const cell of cb.grid[1]!) {
      expect(cell.family).toBe('building')
    }
  })
})

// ---------------------------------------------------------------------------
// Base row — doors
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

  it('base row corners are wall_bl/wall_br', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, 42)
    const baseRow = cb.grid[2]!
    expect(baseRow[0]!.role).toBe('wall_bl')
    expect(baseRow[2]!.role).toBe('wall_br')
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
// Biome material resolution
// ---------------------------------------------------------------------------

describe('biome material integration', () => {
  it('urban biome uses brick walls', () => {
    const cb = composeBuilding({ width: 2, height: 2 }, 'house', 'urban', 100, 42)
    const wallCells = visibleCells(cb).filter(c => c.family === 'building')
    expect(wallCells.length).toBeGreaterThan(0)
    for (const cell of wallCells) {
      expect(cell.material).toBe('brick')
    }
  })

  it('library biome uses wood walls', () => {
    const cb = composeBuilding({ width: 2, height: 2 }, 'house', 'library', 100, 42)
    const wallCells = visibleCells(cb).filter(c => c.family === 'building')
    for (const cell of wallCells) {
      expect(cell.material).toBe('wood')
    }
  })

  it('industrial preset overrides wall to stone', () => {
    const cb = composeBuilding({ width: 3, height: 3 }, 'factory', 'urban', 100, 42)
    const wallCells = visibleCells(cb).filter(c => c.family === 'building')
    for (const cell of wallCells) {
      expect(cell.material).toBe('stone')
    }
  })

  it('tower preset overrides wall to grey', () => {
    const cb = composeBuilding({ width: 2, height: 3 }, 'server_tower', 'urban', 100, 42)
    const wallCells = visibleCells(cb).filter(c => c.family === 'building')
    for (const cell of wallCells) {
      expect(cell.material).toBe('grey')
    }
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

  it('different seeds produce different overlay sets (probabilistically)', () => {
    const results = new Set<number>()
    for (let seed = 0; seed < 100; seed++) {
      const cb = composeBuilding({ width: 3, height: 3 }, 'house', 'urban', 100, seed)
      results.add(cb.overlays.length)
    }
    // Should have at least 2 distinct overlay counts across 100 seeds
    expect(results.size).toBeGreaterThanOrEqual(2)
  })
})
