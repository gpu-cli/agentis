// ============================================================================
// Building Composer — Compositional building tile grid generation
//
// Pure function module. Takes a building's footprint, style, biome, health,
// and seed, then produces a ComposedBuilding — a 2D grid of tile role
// assignments. The renderer resolves textures via SpriteAtlasRegistry.
//
// Replaces: TilemapManager.ts L1490–1796 (uniform texture stamping +
// Graphics roofs/windows/scaffolding).
// ============================================================================

import { normalizeStyle, materialAlpha } from './tile-roles'
import type { BuildingArchetype, MaterialState } from './tile-roles'
import { resolveBiomeMaterials } from './biome-materials'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Output of the building composer — a tile grid + optional overlays */
export interface ComposedBuilding {
  /** Width in tiles */
  width: number
  /** Height in tiles */
  height: number
  /** 2D grid of tile assignments, row-major grid[y][x] */
  grid: TileAssignment[][]
  /** Additional decoration overlays (chimney, antenna, etc.) */
  overlays: OverlayAssignment[]
}

/** A single cell in the composed building grid */
export interface TileAssignment {
  /** Tile role key (e.g., 'wall_tl', 'door', 'tl' for roof) */
  role: string
  /** Material variant (e.g., 'brick', 'red') */
  material: string
  /** Family name (e.g., 'building', 'roof') */
  family: string
  /** Render alpha (affected by health % and material state) */
  alpha: number
  /** Whether this cell is visible (based on health progressive reveal) */
  visible: boolean
}

/** Decoration attached to a building */
export interface OverlayAssignment {
  /** Overlay type */
  type: 'chimney' | 'antenna' | 'dish' | 'smokestack' | 'sign' | 'flag'
  /** Pixel offset from building origin (top-left) */
  offsetX: number
  offsetY: number
  /** Role key for atlas resolution */
  role: string
  /** Family for atlas resolution */
  family: string
  /** Material for atlas resolution */
  material: string
}

// ---------------------------------------------------------------------------
// Style Presets
// ---------------------------------------------------------------------------

interface StylePreset {
  /** Roof style */
  roof: 'peaked' | 'flat' | 'none'
  /** Preferred wall material override (null = use biome default) */
  wallMaterial: string | null
  /** Preferred roof material override (null = use biome default) */
  roofMaterial: string | null
  /** Window density: 'dense' = every middle col, 'normal' = every other, 'sparse' = 1 per row */
  windowDensity: 'dense' | 'normal' | 'sparse'
  /** Door width in tiles */
  doorWidth: 1 | 2
  /** Overlay probabilities (0–1) */
  overlays: Record<string, number>
}

const ARCHETYPE_PRESETS: Record<BuildingArchetype, StylePreset> = {
  residential: {
    roof: 'peaked',
    wallMaterial: null,
    roofMaterial: null,
    windowDensity: 'normal',
    doorWidth: 1,
    overlays: { chimney: 0.4, sign: 0.2 },
  },
  institutional: {
    roof: 'peaked',
    wallMaterial: null,
    roofMaterial: null,
    windowDensity: 'dense',
    doorWidth: 2,
    overlays: { sign: 0.8, flag: 0.1 },
  },
  industrial: {
    roof: 'flat',
    wallMaterial: 'stone',
    roofMaterial: null,
    windowDensity: 'sparse',
    doorWidth: 2,
    overlays: { smokestack: 0.7 },
  },
  tower: {
    roof: 'flat',
    wallMaterial: 'grey',
    roofMaterial: null,
    windowDensity: 'sparse',
    doorWidth: 1,
    overlays: { dish: 0.8, antenna: 0.5 },
  },
}

// ---------------------------------------------------------------------------
// Seeded Random
// ---------------------------------------------------------------------------

/** Simple seeded pseudo-random number generator (deterministic) */
function seededRandom(seed: number): number {
  let s = seed | 0
  s = (s + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ---------------------------------------------------------------------------
// Zone Computation
// ---------------------------------------------------------------------------

interface ZoneLayout {
  roofRows: number
  wallRows: number
  baseRows: number
  hasRoof: boolean
  roofStyle: 'peaked' | 'flat' | 'none'
}

function computeZones(height: number, preset: StylePreset): ZoneLayout {
  if (height === 1) {
    return {
      roofRows: 0,
      wallRows: 0,
      baseRows: 1,
      hasRoof: false,
      roofStyle: 'none',
    }
  }

  if (height === 2) {
    if (preset.roof === 'peaked' || preset.roof === 'flat') {
      return {
        roofRows: 1,
        wallRows: 0,
        baseRows: 1,
        hasRoof: true,
        roofStyle: preset.roof,
      }
    }
    return {
      roofRows: 0,
      wallRows: 1,
      baseRows: 1,
      hasRoof: false,
      roofStyle: 'none',
    }
  }

  // H >= 3
  const roofRows = preset.roof !== 'none' ? 1 : 0
  const wallRows = height - 1 - roofRows
  return {
    roofRows,
    wallRows,
    baseRows: 1,
    hasRoof: preset.roof !== 'none',
    roofStyle: preset.roof,
  }
}

// ---------------------------------------------------------------------------
// Grid Fill
// ---------------------------------------------------------------------------

function fillGrid(
  footprint: { width: number; height: number },
  zones: ZoneLayout,
  wallMat: string,
  roofMat: string,
  preset: StylePreset,
  seed: number,
): TileAssignment[][] {
  const { width, height } = footprint
  const grid: TileAssignment[][] = []

  // Initialize grid with default wall tiles
  for (let y = 0; y < height; y++) {
    const row: TileAssignment[] = []
    for (let x = 0; x < width; x++) {
      row.push({
        role: 'wall_tl',
        material: wallMat,
        family: 'building',
        alpha: 1,
        visible: true,
      })
    }
    grid.push(row)
  }

  // Special case: 1×1 building is a single door tile
  if (width === 1 && height === 1) {
    grid[0]![0] = {
      role: 'door',
      material: wallMat,
      family: 'building',
      alpha: 1,
      visible: true,
    }
    return grid
  }

  let currentRow = 0

  // --- Roof zone ---
  if (zones.hasRoof && zones.roofRows > 0) {
    for (let y = 0; y < zones.roofRows; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[currentRow + y]![x]!
        if (zones.roofStyle === 'peaked') {
          // Peaked roof: alternating tl/tr pattern
          cell.family = 'roof'
          cell.material = roofMat
          if (width === 1) {
            cell.role = 'tl'
          } else if (x === 0) {
            cell.role = 'tl'
          } else if (x === width - 1) {
            cell.role = 'tr'
          } else {
            // Alternate tl/tr for middle tiles
            cell.role = x % 2 === 1 ? 'tl' : 'tr'
          }
        } else {
          // Flat roof: parapet using wall tiles
          cell.family = 'building'
          cell.material = wallMat
          if (x === 0) {
            cell.role = 'wall_tl'
          } else if (x === width - 1) {
            cell.role = 'wall_tr'
          } else {
            cell.role = 'wall_tl'
          }
        }
      }
    }
    currentRow += zones.roofRows
  }

  // --- Wall zone ---
  for (let y = 0; y < zones.wallRows; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[currentRow + y]![x]!
      cell.family = 'building'
      cell.material = wallMat

      if (x === 0) {
        cell.role = 'wall_tl'
      } else if (x === width - 1) {
        cell.role = 'wall_tr'
      } else {
        // Middle columns — window or wall fill based on density
        const shouldWindow = shouldPlaceWindow(
          x,
          width,
          y,
          preset.windowDensity,
          seed,
        )
        cell.role = shouldWindow ? 'window' : 'wall_tl'
      }
    }
    currentRow += 1
  }

  // --- Base zone ---
  if (zones.baseRows > 0) {
    const baseY = height - 1
    const doorCenter = Math.floor(width / 2)

    for (let x = 0; x < width; x++) {
      const cell = grid[baseY]![x]!
      cell.family = 'building'
      cell.material = wallMat

      if (width === 1) {
        // Single-width: just a door
        cell.role = 'door'
      } else if (x === 0) {
        cell.role = 'wall_bl'
      } else if (x === width - 1) {
        cell.role = 'wall_br'
      } else if (isDoorPosition(x, width, doorCenter, preset.doorWidth)) {
        cell.role = 'door'
      } else {
        cell.role = 'wall_bl'
      }
    }
  }

  return grid
}

function shouldPlaceWindow(
  x: number,
  width: number,
  rowIndex: number,
  density: 'dense' | 'normal' | 'sparse',
  seed: number,
): boolean {
  // x is a middle column (not 0 or width-1)
  switch (density) {
    case 'dense':
      return true
    case 'normal':
      return (x + rowIndex) % 2 === 1
    case 'sparse': {
      // Only 1 window per row, position chosen by seed
      const middleCols = width - 2
      if (middleCols <= 0) return false
      const windowCol = 1 + (Math.abs(seed + rowIndex * 7) % middleCols)
      return x === windowCol
    }
  }
}

function isDoorPosition(
  x: number,
  width: number,
  center: number,
  doorWidth: 1 | 2,
): boolean {
  if (doorWidth === 1) {
    return x === center
  }
  // doorWidth === 2: center-left and center-right
  if (width >= 4) {
    const left = Math.floor((width - 1) / 2)
    const right = left + 1
    return x === left || x === right
  }
  // Width < 4 with doorWidth 2: single door at center
  return x === center
}

// ---------------------------------------------------------------------------
// Health Masking
// ---------------------------------------------------------------------------

function applyHealthMask(
  grid: TileAssignment[][],
  footprint: { width: number; height: number },
  health: number,
  baseAlpha: number,
): void {
  const totalTiles = footprint.width * footprint.height
  const visibleCount = Math.ceil(totalTiles * (health / 100))
  let count = 0

  // Bottom-to-top, left-to-right (matching current behavior)
  for (let y = footprint.height - 1; y >= 0; y--) {
    for (let x = 0; x < footprint.width; x++) {
      count++
      const tile = grid[y]![x]!
      if (count <= visibleCount) {
        tile.visible = true
        tile.alpha = (0.7 + (health / 100) * 0.3) * baseAlpha
      } else {
        tile.visible = false
        tile.alpha = 0
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Overlay Generation
// ---------------------------------------------------------------------------

const TILE_SIZE = 32

function generateOverlays(
  preset: StylePreset,
  footprint: { width: number; height: number },
  seed: number,
): OverlayAssignment[] {
  const overlays: OverlayAssignment[] = []
  let seedOffset = 0

  for (const [type, probability] of Object.entries(preset.overlays)) {
    const roll = seededRandom(seed + seedOffset++)
    if (roll < probability) {
      const overlay = createOverlay(
        type as OverlayAssignment['type'],
        footprint,
        seed + seedOffset,
      )
      if (overlay) overlays.push(overlay)
    }
  }

  return overlays
}

function createOverlay(
  type: OverlayAssignment['type'],
  footprint: { width: number; height: number },
  _seed: number,
): OverlayAssignment | null {
  switch (type) {
    case 'chimney':
      return {
        type,
        family: 'decoration',
        material: 'default',
        role: 'crate',
        offsetX: footprint.width * TILE_SIZE * 0.7,
        offsetY: -10,
      }
    case 'antenna':
      return {
        type,
        family: 'decoration',
        material: 'default',
        role: 'fence_v',
        offsetX: footprint.width * TILE_SIZE * 0.8,
        offsetY: -14,
      }
    case 'dish':
      return {
        type,
        family: 'decoration',
        material: 'default',
        role: 'barrel',
        offsetX: footprint.width * TILE_SIZE * 0.5,
        offsetY: -12,
      }
    case 'smokestack':
      return {
        type,
        family: 'decoration',
        material: 'default',
        role: 'fence_v',
        offsetX: footprint.width * TILE_SIZE * 0.85,
        offsetY: -16,
      }
    case 'sign':
      return {
        type,
        family: 'decoration',
        material: 'default',
        role: 'sign',
        offsetX: footprint.width * TILE_SIZE * 0.5,
        offsetY: footprint.height * TILE_SIZE - 8,
      }
    case 'flag':
      return {
        type,
        family: 'decoration',
        material: 'default',
        role: 'flag',
        offsetX: footprint.width * TILE_SIZE * 0.9,
        offsetY: -18,
      }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compose a building into a tile grid.
 *
 * @param footprint     - Building dimensions in tiles { width, height }
 * @param style         - Building style string (e.g., 'house', 'tower', 'modern_office')
 * @param biome         - District biome (e.g., 'urban', 'library', 'industrial')
 * @param health        - Construction health 0–100
 * @param seed          - Deterministic seed for variant/overlay selection
 * @param materialState - Optional material state ('ghost' | 'solid'), defaults to 'solid'
 * @returns ComposedBuilding with tile grid and overlay assignments
 */
export function composeBuilding(
  footprint: { width: number; height: number },
  style: string,
  biome: string,
  health: number,
  seed: number,
  materialState?: MaterialState,
): ComposedBuilding {
  const archetype = normalizeStyle(style)
  const preset = ARCHETYPE_PRESETS[archetype]
  const biomeMats = resolveBiomeMaterials(biome)

  // Resolve effective materials
  const wallMat = preset.wallMaterial ?? biomeMats.wall
  const roofMat = preset.roofMaterial ?? biomeMats.roof

  // Compute zones
  const zones = computeZones(footprint.height, preset)

  // Build grid
  const grid = fillGrid(footprint, zones, wallMat, roofMat, preset, seed)

  // Apply material state alpha
  const baseAlpha = materialAlpha(materialState ?? 'solid')

  // Apply health masking
  applyHealthMask(grid, footprint, health, baseAlpha)

  // Generate overlays (only for mostly-complete buildings)
  const overlays = health >= 80 ? generateOverlays(preset, footprint, seed) : []

  return { width: footprint.width, height: footprint.height, grid, overlays }
}
