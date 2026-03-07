// ============================================================================
// Tile Role Types — Semantic layer between rendering and sprite sheets
// Pure types + utility functions. No PixiJS dependencies.
// ============================================================================

// ---------------------------------------------------------------------------
// Atlas JSON Schema Types (matching atlas-kenney-v2.json structure)
// ---------------------------------------------------------------------------

/** Top-level atlas manifest */
export interface SpriteAtlasV2 {
  /** Schema version — always 2 */
  version: 2
  /** Human-readable atlas name */
  name: string
  /** Sprite sheets referenced by this atlas */
  sheets: Record<string, SheetDef>
  /** Role → region mappings grouped by family */
  families: Record<string, FamilyDef>
}

/** Sprite sheet definition */
export interface SheetDef {
  /** URL or asset path to the sprite sheet image */
  path: string
  /** Tile grid dimensions (for grid-based sheets) */
  grid?: {
    cols: number
    rows: number
    tileWidth: number
    tileHeight: number
  }
}

/** Family of related tile roles */
export interface FamilyDef {
  /** Material variants available for this family */
  materials: Record<string, MaterialDef>
}

/** Material variant within a family */
export interface MaterialDef {
  /** Sheet key this material's tiles come from */
  sheet: string
  /** Role → region mapping */
  roles: Record<string, RegionDef>
}

/** Pixel region within a sprite sheet */
export interface RegionDef {
  /** Pixel x offset in the sheet */
  x: number
  /** Pixel y offset in the sheet */
  y: number
  /** Pixel width */
  w: number
  /** Pixel height */
  h: number
  /** Number of animation frames in a horizontal strip. Default: 1 */
  frames?: number
  /** Visual variant alternatives (picked by seeded random) */
  variants?: Array<{ x: number; y: number; w: number; h: number }>
}

// ---------------------------------------------------------------------------
// Building Archetype — normalized style for composition
// ---------------------------------------------------------------------------

/**
 * Normalized building archetype. The adapter emits `house | large | tower`
 * (from SizeBand), legacy paths emit `modern_office | library | factory |
 * server_tower`. Both are mapped to these four archetypes which drive the
 * BuildingComposer's zone decomposition and style presets.
 */
export type BuildingArchetype = 'residential' | 'institutional' | 'industrial' | 'tower'

const STYLE_MAP: Record<string, BuildingArchetype> = {
  // Adapter styles (from world-model SizeBand)
  house: 'residential',
  large: 'institutional',
  tower: 'tower',

  // Legacy styles (from useScenarioReplay / projector)
  modern_office: 'institutional',
  library: 'institutional',
  factory: 'industrial',
  server_tower: 'tower',

  // Direct archetype names (pass-through)
  residential: 'residential',
  institutional: 'institutional',
  industrial: 'industrial',
}

/**
 * Normalize any building style string to a BuildingArchetype.
 * Unknown styles fall back to 'residential'.
 */
export function normalizeStyle(style: string): BuildingArchetype {
  return STYLE_MAP[style] ?? 'residential'
}

// ---------------------------------------------------------------------------
// Material State — branch-aware rendering opacity
// ---------------------------------------------------------------------------

/**
 * Material state for branch-aware rendering.
 * - `ghost`: File exists only on a feature branch (not yet merged)
 * - `solid`: File exists on the main branch
 */
export type MaterialState = 'ghost' | 'solid'

/**
 * Returns the render alpha for a given material state.
 * Ghost buildings render at reduced opacity to indicate unmerged work.
 */
export function materialAlpha(state: MaterialState): number {
  return state === 'ghost' ? 0.45 : 1.0
}

// ---------------------------------------------------------------------------
// Tile Role Constants
// ---------------------------------------------------------------------------

/** Building structure tile roles */
export const BUILDING_ROLES = [
  'wall_tl', 'wall_tr', 'wall_bl', 'wall_br',
  'wall_h', 'wall_v',
  'door', 'window',
] as const

/** Roof tile roles */
export const ROOF_ROLES = ['tl', 'tr', 'bl', 'br'] as const

/** District wall tile roles (for autotiling) */
export const WALL_ROLES = [
  'edge_n', 'edge_s', 'edge_e', 'edge_w',
  'corner_ne', 'corner_nw', 'corner_se', 'corner_sw',
  'corner_inner_ne', 'corner_inner_nw', 'corner_inner_se', 'corner_inner_sw',
  'gate_h', 'gate_v', 'isolated',
] as const

/** Road tile roles (for autotiling) */
export const ROAD_ROLES = [
  'straight_h', 'straight_v',
  'turn_ne', 'turn_nw', 'turn_se', 'turn_sw',
  't_n', 't_s', 't_e', 't_w',
  'cross',
  'end_n', 'end_s', 'end_e', 'end_w',
  'isolated',
] as const

export type BuildingRole = (typeof BUILDING_ROLES)[number]
export type RoofRole = (typeof ROOF_ROLES)[number]
export type WallRole = (typeof WALL_ROLES)[number]
export type RoadRole = (typeof ROAD_ROLES)[number]
