// ============================================================================
// Biome Material Mapping — Data-driven biome-to-material configuration
// Pure data + resolver. No PixiJS dependencies.
// ============================================================================

import type { BuildingKit } from './BuildingComposer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Material selections for a biome */
export interface BiomeMaterialSet {
  /** Wall material key (e.g., 'brick', 'wood', 'stone') */
  wall: string
  /** Roof material key (e.g., 'red', 'blue', 'brown') */
  roof: string
  /** Road material key for the old/generic road path (kept for backward compat) */
  road: string
  /** Road material key for internal district roads (dungeon-style planks) */
  roadInternal: string
  /** Road material key for inter-district connector roads (dungeon-style ornate) */
  roadConnector: string
  /** Ground material key (e.g., 'grass', 'dirt') */
  ground: string
  /** Preferred building kit ('type1' | 'type2'). When undefined, seed selects. */
  buildingKit?: BuildingKit
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Default material selections per biome.
 * Each biome maps to a set of material keys that the SpriteAtlasRegistry
 * uses to resolve specific tile textures.
 *
 * buildingKit selects between Type 1 (brick/red roof) and Type 2 (stone/blue roof)
 * building tile kits. Biomes without a preference let the building seed decide.
 */
export const BIOME_MATERIALS: Record<string, BiomeMaterialSet> = {
  urban:       { wall: 'brick',  roof: 'red',   road: 'cobble', roadInternal: 'internal', roadConnector: 'connector', ground: 'grass', buildingKit: 'type1' },
  library:     { wall: 'wood',   roof: 'brown', road: 'cobble', roadInternal: 'internal', roadConnector: 'connector', ground: 'grass', buildingKit: 'type1' },
  industrial:  { wall: 'stone',  roof: 'brown', road: 'path',   roadInternal: 'internal', roadConnector: 'connector', ground: 'grass', buildingKit: 'type2' },
  observatory: { wall: 'grey',   roof: 'blue',  road: 'path',   roadInternal: 'internal', roadConnector: 'connector', ground: 'grass', buildingKit: 'type2' },
  arts:        { wall: 'brick',  roof: 'blue',  road: 'path',   roadInternal: 'internal', roadConnector: 'connector', ground: 'grass' },
  harbor:      { wall: 'wood',   roof: 'brown', road: 'path',   roadInternal: 'internal', roadConnector: 'connector', ground: 'grass' },
  civic:       { wall: 'castle', roof: 'red',   road: 'cobble', roadInternal: 'internal', roadConnector: 'connector', ground: 'grass', buildingKit: 'type1' },
  plains:      { wall: 'wood',   roof: 'brown', road: 'path',   roadInternal: 'internal', roadConnector: 'connector', ground: 'grass' },
}

/** Fallback materials when biome is unknown */
export const DEFAULT_MATERIALS: BiomeMaterialSet = {
  wall: 'brick',
  roof: 'red',
  road: 'path',
  roadInternal: 'internal',
  roadConnector: 'connector',
  ground: 'grass',
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve material set for a biome.
 * Returns the biome-specific materials if available, otherwise the default.
 */
export function resolveBiomeMaterials(biome: string | undefined): BiomeMaterialSet {
  if (!biome) return DEFAULT_MATERIALS
  return BIOME_MATERIALS[biome] ?? DEFAULT_MATERIALS
}
