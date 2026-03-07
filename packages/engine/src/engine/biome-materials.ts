// ============================================================================
// Biome Material Mapping — Data-driven biome-to-material configuration
// Pure data + resolver. No PixiJS dependencies.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Material selections for a biome */
export interface BiomeMaterialSet {
  /** Wall material key (e.g., 'brick', 'wood', 'stone') */
  wall: string
  /** Roof material key (e.g., 'red', 'blue', 'brown') */
  roof: string
  /** Road material key (e.g., 'cobble', 'path') */
  road: string
  /** Ground material key (e.g., 'grass', 'dirt') */
  ground: string
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Default material selections per biome.
 * Each biome maps to a set of material keys that the SpriteAtlasRegistry
 * uses to resolve specific tile textures.
 */
export const BIOME_MATERIALS: Record<string, BiomeMaterialSet> = {
  urban:       { wall: 'brick',  roof: 'red',   road: 'cobble', ground: 'grass' },
  library:     { wall: 'wood',   roof: 'brown', road: 'cobble', ground: 'grass' },
  industrial:  { wall: 'stone',  roof: 'brown', road: 'path',   ground: 'grass' },
  observatory: { wall: 'grey',   roof: 'blue',  road: 'path',   ground: 'grass' },
  arts:        { wall: 'brick',  roof: 'blue',  road: 'path',   ground: 'grass' },
  harbor:      { wall: 'wood',   roof: 'brown', road: 'path',   ground: 'grass' },
  civic:       { wall: 'castle', roof: 'red',   road: 'cobble', ground: 'grass' },
  plains:      { wall: 'wood',   roof: 'brown', road: 'path',   ground: 'grass' },
}

/** Fallback materials when biome is unknown */
export const DEFAULT_MATERIALS: BiomeMaterialSet = {
  wall: 'brick',
  roof: 'red',
  road: 'path',
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
