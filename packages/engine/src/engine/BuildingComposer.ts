// ============================================================================
// Building Composer — Compositional building tile grid generation
//
// Pure function module. Takes a building's footprint, style, biome, health,
// and seed, then produces a ComposedBuilding — a 2D grid of tile role
// assignments. The renderer resolves textures via SpriteAtlasRegistry.
//
// V2: Uses type1/type2 building kits from the atlas. Every building has:
//   - Top row: roof tiles + chimney
//   - Bottom row: door (centered) + wall tiles
//   - Middle rows: standard wall tiles
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
  /** Additional decoration overlays (sign, flag, etc.) */
  overlays: OverlayAssignment[]
}

/** A single cell in the composed building grid */
export interface TileAssignment {
  /** Tile role key (e.g., 'wall_left', 'door', 'roof_left', 'roof_chimney') */
  role: string
  /** Material variant (e.g., 'type1', 'type2') */
  material: string
  /** Family name — always 'building' for kit-based rendering */
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
  /** Whether to include a roof row (always true now, kept for 1×1 edge case) */
  hasRoof: boolean
  /** Door width in tiles */
  doorWidth: 1 | 2
  /** Overlay probabilities (0–1) — chimney removed; it's now a tile */
  overlays: Record<string, number>
}

const ARCHETYPE_PRESETS: Record<BuildingArchetype, StylePreset> = {
  residential: {
    hasRoof: true,
    doorWidth: 1,
    overlays: { sign: 0.2 },
  },
  institutional: {
    hasRoof: true,
    doorWidth: 2,
    overlays: { sign: 0.8, flag: 0.1 },
  },
  industrial: {
    hasRoof: true,
    doorWidth: 2,
    overlays: { sign: 0.3 },
  },
  tower: {
    hasRoof: true,
    doorWidth: 1,
    overlays: { sign: 0.2 },
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
// Building Kit Selection
// ---------------------------------------------------------------------------

/** Available building kit materials in the atlas */
export type BuildingKit = 'type1' | 'type2'

/**
 * Select a building kit deterministically from the seed.
 * The biome-materials system provides a preferred kit, but the seed
 * is used as fallback for biomes without a preference.
 */
function selectKit(seed: number, biomeKit: BuildingKit | undefined): BuildingKit {
  if (biomeKit) return biomeKit
  return seed % 2 === 0 ? 'type1' : 'type2'
}

// ---------------------------------------------------------------------------
// Zone Computation
// ---------------------------------------------------------------------------

interface ZoneLayout {
  roofRows: number
  wallRows: number
  baseRows: number
  hasRoof: boolean
}

function computeZones(height: number, preset: StylePreset): ZoneLayout {
  if (height === 1) {
    // 1-tall: just a door, no roof
    return { roofRows: 0, wallRows: 0, baseRows: 1, hasRoof: false }
  }

  if (height === 2) {
    // 2-tall: roof row + base row (door)
    return { roofRows: 1, wallRows: 0, baseRows: 1, hasRoof: preset.hasRoof }
  }

  // H >= 3: roof row + wall rows + base row
  const roofRows = preset.hasRoof ? 1 : 0
  const wallRows = height - 1 - roofRows
  return { roofRows, wallRows, baseRows: 1, hasRoof: preset.hasRoof }
}

// ---------------------------------------------------------------------------
// Grid Fill — Building Kit Roles
//
// Each building uses roles from the type1/type2 kit:
//   Roof row:   roof_left, roof_mid (repeated), roof_right, roof_chimney
//   Wall rows:  wall_left, wall_mid (repeated), wall_right
//   Base row:   wall_left, wall_mid/door, wall_right
// ---------------------------------------------------------------------------

function fillGrid(
  footprint: { width: number; height: number },
  zones: ZoneLayout,
  kit: BuildingKit,
  preset: StylePreset,
  seed: number,
): TileAssignment[][] {
  const { width, height } = footprint
  const grid: TileAssignment[][] = []

  // Helper to create a cell
  const cell = (role: string): TileAssignment => ({
    role,
    material: kit,
    family: 'building',
    alpha: 1,
    visible: true,
  })

  // Initialize grid with default wall_mid tiles
  for (let y = 0; y < height; y++) {
    const row: TileAssignment[] = []
    for (let x = 0; x < width; x++) {
      row.push(cell('wall_mid'))
    }
    grid.push(row)
  }

  // Special case: 1×1 building is a single door tile
  if (width === 1 && height === 1) {
    grid[0]![0] = cell('door')
    return grid
  }

  let currentRow = 0

  // --- Roof zone ---
  if (zones.hasRoof && zones.roofRows > 0) {
    fillRoofRow(grid[currentRow]!, width, kit, seed)
    currentRow += zones.roofRows
  }

  // --- Wall zone ---
  for (let y = 0; y < zones.wallRows; y++) {
    fillWallRow(grid[currentRow + y]!, width, kit)
  }
  currentRow += zones.wallRows

  // --- Base zone (bottom row with door) ---
  if (zones.baseRows > 0) {
    const baseY = height - 1
    fillBaseRow(grid[baseY]!, width, kit, preset.doorWidth)
  }

  return grid
}

/**
 * Fill a roof row with roof tiles and a chimney.
 *
 * Layout strategy by width:
 *   W=1: roof_chimney (just chimney)
 *   W=2: roof_left, roof_chimney
 *   W=3: roof_left, roof_mid, roof_chimney
 *   W=4: roof_left, roof_mid, roof_right, roof_chimney
 *   W≥5: roof_left, roof_mid..., roof_right, roof_chimney
 *
 * Chimney is always the rightmost tile.
 */
function fillRoofRow(
  row: TileAssignment[],
  width: number,
  kit: BuildingKit,
  _seed: number,
): void {
  const assign = (x: number, role: string) => {
    row[x] = { role, material: kit, family: 'building', alpha: 1, visible: true }
  }

  if (width === 1) {
    assign(0, 'roof_chimney')
    return
  }

  if (width === 2) {
    assign(0, 'roof_left')
    assign(1, 'roof_chimney')
    return
  }

  // W >= 3: left edge, middle fills, right before chimney, chimney at end
  assign(0, 'roof_left')

  // Middle tiles
  for (let x = 1; x < width - 2; x++) {
    assign(x, 'roof_mid')
  }

  // Second-to-last = roof_right
  assign(width - 2, 'roof_right')

  // Last = chimney
  assign(width - 1, 'roof_chimney')
}

/**
 * Fill a wall row with wall_left, wall_mid, wall_right.
 */
function fillWallRow(
  row: TileAssignment[],
  width: number,
  kit: BuildingKit,
): void {
  const assign = (x: number, role: string) => {
    row[x] = { role, material: kit, family: 'building', alpha: 1, visible: true }
  }

  if (width === 1) {
    assign(0, 'wall_mid')
    return
  }

  assign(0, 'wall_left')
  for (let x = 1; x < width - 1; x++) {
    assign(x, 'wall_mid')
  }
  assign(width - 1, 'wall_right')
}

/**
 * Fill the base (bottom) row with walls and a centered door.
 *
 * Layout strategy:
 *   W=1: door
 *   W=2: wall_left, door
 *   W≥3: wall_left, [wall_mid...], door (centered), [wall_mid...], wall_right
 *
 * For doorWidth=2 and W≥4: two adjacent door tiles centered.
 */
function fillBaseRow(
  row: TileAssignment[],
  width: number,
  kit: BuildingKit,
  doorWidth: 1 | 2,
): void {
  const assign = (x: number, role: string) => {
    row[x] = { role, material: kit, family: 'building', alpha: 1, visible: true }
  }

  if (width === 1) {
    assign(0, 'door')
    return
  }

  if (width === 2) {
    assign(0, 'wall_left')
    assign(1, 'door')
    return
  }

  // W >= 3: left edge, middle fills, door(s), right edge
  assign(0, 'wall_left')
  assign(width - 1, 'wall_right')

  const doorCenter = Math.floor(width / 2)

  for (let x = 1; x < width - 1; x++) {
    if (isDoorPosition(x, width, doorCenter, doorWidth)) {
      assign(x, 'door')
    } else {
      assign(x, 'wall_mid')
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
 * Uses type1/type2 building kits from the atlas. Every building follows
 * a strict row contract:
 *   - Top row: roof tiles + chimney (always)
 *   - Middle rows: wall tiles
 *   - Bottom row: wall tiles + centered door
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

  // Select building kit (type1 or type2)
  const kit = selectKit(seed, biomeMats.buildingKit)

  // Compute zones
  const zones = computeZones(footprint.height, preset)

  // Build grid
  const grid = fillGrid(footprint, zones, kit, preset, seed)

  // Apply material state alpha
  const baseAlpha = materialAlpha(materialState ?? 'solid')

  // Apply health masking
  applyHealthMask(grid, footprint, health, baseAlpha)

  // Generate overlays (only for mostly-complete buildings)
  const overlays = health >= 80 ? generateOverlays(preset, footprint, seed) : []

  return { width: footprint.width, height: footprint.height, grid, overlays }
}
