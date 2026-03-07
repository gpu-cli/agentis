// ============================================================================
// Terrain Utilities — Shared functions for organic island shape generation
//
// Used by TilemapManager (rendering) and FogOfWar (mask clipping).
// All functions are pure and deterministic (seeded randomness).
// ============================================================================

import type { Graphics } from 'pixi.js'

// ---------------------------------------------------------------------------
// Seeded deterministic noise
// ---------------------------------------------------------------------------

/** Simple seeded hash — deterministic pseudo-random from a seed value */
export function seededRandom(seed: number): number {
  let s = seed | 0
  s = ((s + 0x6d2b79f5) | 0)
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Hash a string to a number for deterministic randomness */
export function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// ---------------------------------------------------------------------------
// Polygon generation
// ---------------------------------------------------------------------------

/** Traits derived from transcript data that influence island shape */
export interface IslandShapeTraits {
  /** Number of districts on this island (drives peninsula count) */
  districtCount: number
  /** Total number of buildings across all districts (drives coastline complexity) */
  buildingCount: number
  /** Number of agents working on this island (drives asymmetry) */
  agentCount: number
  /** Biome name — different biomes get different base silhouettes */
  biome: string
}

/** Default traits for backward compatibility when no transcript data is available */
const DEFAULT_TRAITS: IslandShapeTraits = {
  districtCount: 3,
  buildingCount: 10,
  agentCount: 2,
  biome: 'urban',
}

/**
 * Generate an organic, trait-driven coastline polygon around a bounding rect.
 *
 * Instead of a simple noisy ellipse, the shape is built from:
 *   1. **Base silhouette** — the aspect ratio of halfW/halfH is preserved
 *   2. **Harmonic perturbation** — low-frequency sinusoidal bumps create
 *      peninsulas and bays. The number of lobes is derived from districtCount
 *      (2–6 harmonics), and their amplitude from buildingCount.
 *   3. **Asymmetry offset** — agentCount seeds a phase shift so no two
 *      islands with different agent activity look the same.
 *   4. **High-frequency noise** — small-scale roughness for organic feel.
 *
 * All randomness is deterministic from `seed`.
 *
 * @param cx Center X
 * @param cy Center Y
 * @param halfW Half-width of the base ellipse
 * @param halfH Half-height of the base ellipse
 * @param seed Deterministic seed
 * @param pointCount Number of polygon vertices
 * @param noiseAmplitude How much high-frequency noise to apply (0–1)
 * @param traits Optional transcript-derived traits for shape variation
 */
export function generateCoastlinePolygon(
  cx: number, cy: number,
  halfW: number, halfH: number,
  seed: number,
  pointCount = 48,
  noiseAmplitude = 0.12,
  traits?: IslandShapeTraits,
): { x: number; y: number }[] {
  const t = traits ?? DEFAULT_TRAITS
  const points: { x: number; y: number }[] = []

  // --- Harmonic configuration derived from traits ---

  // Number of lobes (peninsulas/bays): 2–6 based on district count
  const lobeCount = Math.max(2, Math.min(6, t.districtCount))

  // Lobe amplitude: more buildings → more pronounced peninsulas (0.06–0.18)
  const lobeAmp = 0.06 + Math.min(0.12, t.buildingCount * 0.003)

  // Secondary harmonic: creates smaller sub-peninsulas
  const secondaryFreq = lobeCount * 2 + 1 // odd harmonic for asymmetry
  const secondaryAmp = lobeAmp * 0.35

  // Tertiary harmonic: very subtle wobble
  const tertiaryFreq = lobeCount * 3 + 2
  const tertiaryAmp = lobeAmp * 0.15

  // Phase offsets seeded from traits for unique silhouettes
  const phaseBase = seededRandom(seed + 7777) * Math.PI * 2
  const phase2 = seededRandom(seed + t.agentCount * 31 + 8888) * Math.PI * 2
  const phase3 = seededRandom(seed + t.buildingCount * 17 + 9999) * Math.PI * 2

  // Asymmetry: slight squash in one direction based on biome
  const biomeHash = hashString(t.biome)
  const squashAngle = seededRandom(biomeHash) * Math.PI
  const squashAmount = 0.03 + seededRandom(biomeHash + 1) * 0.05 // 3–8% squash

  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2

    // --- Harmonic displacement (creates peninsulas & bays) ---
    const h1 = Math.sin(angle * lobeCount + phaseBase) * lobeAmp
    const h2 = Math.sin(angle * secondaryFreq + phase2) * secondaryAmp
    const h3 = Math.sin(angle * tertiaryFreq + phase3) * tertiaryAmp

    // Combined harmonic factor (multiplied with base radius)
    const harmonicFactor = 1.0 + h1 + h2 + h3

    // --- Directional squash for asymmetry ---
    const squashFactor = 1.0 - squashAmount * Math.cos(2 * (angle - squashAngle))

    // --- Base ellipse with harmonic + squash modulation ---
    const baseX = Math.cos(angle) * halfW * harmonicFactor * squashFactor
    const baseY = Math.sin(angle) * halfH * harmonicFactor * squashFactor

    // --- High-frequency noise for organic roughness ---
    const n1 = seededRandom(seed + i * 137) * 2 - 1
    const n2 = seededRandom(seed + i * 293 + 1000) * 2 - 1
    const n3 = seededRandom(seed + i * 571 + 2000) * 2 - 1
    const dist = Math.sqrt(baseX * baseX + baseY * baseY)
    const noise = (n1 * 0.6 + n2 * 0.3 + n3 * 0.1) * noiseAmplitude * dist

    const nx = Math.cos(angle) * noise
    const ny = Math.sin(angle) * noise

    points.push({
      x: cx + baseX + nx,
      y: cy + baseY + ny,
    })
  }

  return points
}

/**
 * Generate a softer organic shape for district boundaries.
 * Fewer points and less displacement for a smoother look.
 * District boundaries don't use trait-based harmonics.
 */
export function generateDistrictPolygon(
  cx: number, cy: number,
  halfW: number, halfH: number,
  seed: number,
): { x: number; y: number }[] {
  // Pass no traits — districts use the simple ellipse+noise shape
  return generateCoastlinePolygon(cx, cy, halfW, halfH, seed, 32, 0.08)
}

// ---------------------------------------------------------------------------
// Polygon helpers
// ---------------------------------------------------------------------------

/** Draw a polygon path on a PixiJS Graphics object */
export function drawPolygon(g: Graphics, points: { x: number; y: number }[]): void {
  if (points.length < 3) return
  g.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) {
    g.lineTo(points[i]!.x, points[i]!.y)
  }
  g.closePath()
}

/** Check if a point is inside a polygon (ray-casting algorithm) */
export function pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x, yi = poly[i]!.y
    const xj = poly[j]!.x, yj = poly[j]!.y
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Lighten a hex color by a factor (0–1) */
export function lighten(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + Math.round(255 * amount))
  const g = Math.min(255, ((color >> 8) & 0xff) + Math.round(255 * amount))
  const b = Math.min(255, (color & 0xff) + Math.round(255 * amount))
  return (r << 16) | (g << 8) | b
}

/** Darken a hex color by a factor (0–1) */
export function darken(color: number, amount: number): number {
  const r = Math.max(0, ((color >> 16) & 0xff) - Math.round(255 * amount))
  const g = Math.max(0, ((color >> 8) & 0xff) - Math.round(255 * amount))
  const b = Math.max(0, (color & 0xff) - Math.round(255 * amount))
  return (r << 16) | (g << 8) | b
}
