// ============================================================================
// Sprite Atlas Registry — Role-based texture resolution
//
// Loads a SpriteAtlasV2 JSON manifest and resolves (family, material, role)
// tuples to PixiJS Textures. Uses frame-based slicing (no RenderTexture),
// with an internal cache for deduplication.
//
// Usage:
//   import { spriteAtlas } from './SpriteAtlasRegistry'
//   await spriteAtlas.init()
//   const tex = spriteAtlas.resolve('building', 'brick', 'wall_tl')
// ============================================================================

import { Texture, Rectangle, Assets } from 'pixi.js'
import type { SpriteAtlasV2, RegionDef } from './tile-roles'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ATLAS_PATH = '/assets/atlases/atlas-kenney-v2.json'

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class SpriteAtlasRegistry {
  /** Loaded atlas manifest */
  private atlas: SpriteAtlasV2 | null = null

  /** Loaded sprite sheet base textures keyed by sheet name */
  private sheetTextures = new Map<string, Texture>()

  /** Resolved texture cache: "family.material.role" → Texture */
  private textureCache = new Map<string, Texture>()

  /** Variant cache: "family.material.role" → Texture[] (primary + variants) */
  private variantCache = new Map<string, Texture[]>()

  /** Whether the registry has been initialized */
  private initialized = false

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Load the atlas JSON and all referenced sprite sheets.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  async init(): Promise<void> {
    if (this.initialized) return

    // Load atlas manifest
    try {
      const response = await fetch(ATLAS_PATH)
      if (!response.ok) {
        console.warn(`[SpriteAtlasRegistry] Failed to load atlas: ${response.status}`)
        return
      }
      this.atlas = (await response.json()) as SpriteAtlasV2
    } catch (err) {
      console.warn('[SpriteAtlasRegistry] Failed to fetch atlas JSON:', err)
      return
    }

    // Load each referenced sprite sheet
    for (const [sheetKey, sheetDef] of Object.entries(this.atlas.sheets)) {
      try {
        // Assets.load handles deduplication internally
        const tex = await Assets.load<Texture>(sheetDef.path)
        if (tex) {
          tex.source.scaleMode = 'nearest'
          this.sheetTextures.set(sheetKey, tex)
        }
      } catch (err) {
        console.warn(`[SpriteAtlasRegistry] Failed to load sheet "${sheetKey}":`, err)
      }
    }

    this.initialized = true
  }

  // -----------------------------------------------------------------------
  // Resolution
  // -----------------------------------------------------------------------

  /**
   * Resolve a tile texture by (family, material, role).
   *
   * @param family   - Tile family (e.g., 'building', 'roof', 'road')
   * @param material - Material variant (e.g., 'brick', 'red', 'cobble')
   * @param role     - Specific tile role (e.g., 'wall_tl', 'tl', 'straight_h')
   * @param seed     - Optional seed for deterministic variant selection
   * @returns Resolved Texture, or Texture.WHITE as fallback
   */
  resolve(family: string, material: string, role: string, seed?: number): Texture {
    if (!this.atlas) return Texture.WHITE

    const cacheKey = `${family}.${material}.${role}`

    // If seed is provided and variants exist, resolve with variant selection
    if (seed !== undefined) {
      return this.resolveWithVariant(family, material, role, seed, cacheKey)
    }

    // Check cache
    const cached = this.textureCache.get(cacheKey)
    if (cached) return cached

    // Look up in atlas
    const regionResult = this.lookupRegion(family, material, role)
    if (!regionResult) return Texture.WHITE

    const tex = this.sliceTexture(regionResult.sheetKey, regionResult.region)
    this.textureCache.set(cacheKey, tex)
    return tex
  }

  /**
   * Check whether a given (family, material, role) combination exists in the atlas.
   */
  has(family: string, material: string, role: string): boolean {
    if (!this.atlas) return false
    const fam = this.atlas.families[family]
    if (!fam) return false
    const mat = fam.materials[material]
    if (!mat) return false
    return role in mat.roles
  }

  /**
   * Clear all cached textures. Call on atlas hot-reload or cleanup.
   */
  clear(): void {
    this.textureCache.clear()
    this.variantCache.clear()
  }

  /**
   * Check whether the registry has been successfully initialized.
   */
  get isReady(): boolean {
    return this.initialized && this.atlas !== null
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private resolveWithVariant(
    family: string,
    material: string,
    role: string,
    seed: number,
    cacheKey: string,
  ): Texture {
    // Build variant array once per role
    let variants = this.variantCache.get(cacheKey)
    if (!variants) {
      const regionResult = this.lookupRegion(family, material, role)
      if (!regionResult) return Texture.WHITE

      const { sheetKey, region } = regionResult
      const primary = this.sliceTexture(sheetKey, region)
      variants = [primary]

      if (region.variants) {
        for (const v of region.variants) {
          variants.push(this.sliceTexture(sheetKey, v))
        }
      }

      this.variantCache.set(cacheKey, variants)
    }

    // Deterministic pick
    const idx = Math.abs(seed) % variants.length
    return variants[idx]!
  }

  private lookupRegion(
    family: string,
    material: string,
    role: string,
  ): { sheetKey: string; region: RegionDef } | null {
    if (!this.atlas) return null

    const fam = this.atlas.families[family]
    if (!fam) return null

    const mat = fam.materials[material]
    if (!mat) return null

    const region = mat.roles[role]
    if (!region) return null

    return { sheetKey: mat.sheet, region }
  }

  private sliceTexture(
    sheetKey: string,
    region: { x: number; y: number; w: number; h: number },
  ): Texture {
    const baseTexture = this.sheetTextures.get(sheetKey)
    if (!baseTexture) return Texture.WHITE

    const frame = new Rectangle(region.x, region.y, region.w, region.h)
    const tex = new Texture({ source: baseTexture.source, frame })
    tex.source.scaleMode = 'nearest'
    return tex
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/** Global sprite atlas registry instance */
export const spriteAtlas = new SpriteAtlasRegistry()
