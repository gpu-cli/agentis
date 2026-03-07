// ============================================================================
// District Parceler — Internal road grid + building parcel layout
//
// Takes a district's bounds and building list, produces a DistrictLayout
// with road spine, building parcels, and decoration zones.
//
// This is the road-aware layout system described in Phase 5 of the
// sprite-mapping plan. It generates internal road networks within districts
// and positions buildings along those roads with setbacks.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A road spine with main road and side streets */
export interface RoadSpine {
  /** Main road segments (connected waypoints in tile coords) */
  main: { x: number; y: number }[]
  /** Side street segments branching from main */
  branches: { x: number; y: number }[][]
  /** Gate positions where roads exit the district walls */
  gates: {
    x: number
    y: number
    direction: 'n' | 's' | 'e' | 'w'
  }[]
}

/** A building parcel within a district block */
export interface Parcel {
  /** Total parcel bounds (includes setback) */
  bounds: { x: number; y: number; w: number; h: number }
  /** Usable building area (parcel minus setback) */
  buildable: { x: number; y: number; w: number; h: number }
  /** Direction the building "faces" (toward the nearest road) */
  facing: 'n' | 's' | 'e' | 'w'
  /** Assigned building ID (null = empty lot for decoration) */
  buildingId: string | null
}

/** Decoration zone in an unused area */
export interface DecorationItem {
  role: string
  family: string
  material: string
  x: number
  y: number
}

/** Complete layout for a district's internal structure */
export interface DistrictLayout {
  /** District ID */
  districtId: string
  /** Internal road grid */
  roads: RoadSpine
  /** Building parcels with assignments */
  parcels: Parcel[]
  /** Decoration items for empty zones */
  decorations: DecorationItem[]
  /** Gate positions (for wall autotiling integration) */
  gates: { x: number; y: number; direction: 'n' | 's' | 'e' | 'w' }[]
}

// ---------------------------------------------------------------------------
// Seeded Random
// ---------------------------------------------------------------------------

function seededRandom(seed: number): number {
  let s = seed | 0
  s = (s + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ---------------------------------------------------------------------------
// Road Spine Generation
// ---------------------------------------------------------------------------

function generateRoadSpine(
  bounds: { x: number; y: number; w: number; h: number },
  buildingCount: number,
  seed: number,
): RoadSpine {
  const { x, y, w, h } = bounds
  const isWide = w >= h

  // Main road direction follows the longer axis
  const main: { x: number; y: number }[] = []
  const branches: { x: number; y: number }[][] = []
  const gates: RoadSpine['gates'] = []

  // Jitter the spine slightly off-center using seed
  const jitter = Math.floor((seededRandom(seed) - 0.5) * 2)

  if (isWide) {
    // Horizontal main road through center
    const midY = y + Math.floor(h / 2) + jitter
    main.push({ x: x + 2, y: midY })
    main.push({ x: x + w - 2, y: midY })
    gates.push({ x: x, y: midY, direction: 'w' })
    gates.push({ x: x + w, y: midY, direction: 'e' })

    // Side streets at regular intervals
    const spacing = Math.max(4, Math.floor(w / Math.ceil(buildingCount / 4 + 1)))
    for (let sx = x + spacing; sx < x + w - 2; sx += spacing) {
      branches.push([
        { x: sx, y: y + 2 },
        { x: sx, y: y + h - 2 },
      ])
    }
  } else {
    // Vertical main road through center
    const midX = x + Math.floor(w / 2) + jitter
    main.push({ x: midX, y: y + 2 })
    main.push({ x: midX, y: y + h - 2 })
    gates.push({ x: midX, y: y, direction: 'n' })
    gates.push({ x: midX, y: y + h, direction: 's' })

    // Side streets at regular intervals
    const spacing = Math.max(4, Math.floor(h / Math.ceil(buildingCount / 4 + 1)))
    for (let sy = y + spacing; sy < y + h - 2; sy += spacing) {
      branches.push([
        { x: x + 2, y: sy },
        { x: x + w - 2, y: sy },
      ])
    }
  }

  return { main, branches, gates }
}

// ---------------------------------------------------------------------------
// Parcel Allocation
// ---------------------------------------------------------------------------

function allocateParcels(
  bounds: { x: number; y: number; w: number; h: number },
  _roads: RoadSpine,
  buildings: { id: string; width: number; height: number }[],
  _seed: number,
): Parcel[] {
  const parcels: Parcel[] = []
  const isWide = bounds.w >= bounds.h

  // Simple shelf packing: place buildings along the road
  const setback = 1 // 1-tile setback from road
  let cursor = isWide ? bounds.x + 2 : bounds.y + 2

  // Place on alternating sides of the main road
  const midX = bounds.x + Math.floor(bounds.w / 2)
  const midY = bounds.y + Math.floor(bounds.h / 2)

  for (let i = 0; i < buildings.length; i++) {
    const bld = buildings[i]!
    const side = i % 2 === 0 ? -1 : 1 // Alternate sides

    let px: number, py: number, facing: 'n' | 's' | 'e' | 'w'

    if (isWide) {
      // Buildings along horizontal main road
      const row = Math.floor(i / 2)
      px = bounds.x + 2 + (row * (bld.width + 2))
      if (px + bld.width > bounds.x + bounds.w - 2) {
        px = bounds.x + 2 + ((row % 3) * (bld.width + 2))
      }

      if (side < 0) {
        py = midY - setback - bld.height
        facing = 's'
      } else {
        py = midY + setback + 1
        facing = 'n'
      }
    } else {
      // Buildings along vertical main road
      const row = Math.floor(i / 2)
      py = bounds.y + 2 + (row * (bld.height + 2))
      if (py + bld.height > bounds.y + bounds.h - 2) {
        py = bounds.y + 2 + ((row % 3) * (bld.height + 2))
      }

      if (side < 0) {
        px = midX - setback - bld.width
        facing = 'e'
      } else {
        px = midX + setback + 1
        facing = 'w'
      }
    }

    // Clamp to district bounds
    px = Math.max(bounds.x + 1, Math.min(px, bounds.x + bounds.w - bld.width - 1))
    py = Math.max(bounds.y + 1, Math.min(py, bounds.y + bounds.h - bld.height - 1))

    parcels.push({
      bounds: { x: px - 1, y: py - 1, w: bld.width + 2, h: bld.height + 2 },
      buildable: { x: px, y: py, w: bld.width, h: bld.height },
      facing,
      buildingId: bld.id,
    })

    cursor += (isWide ? bld.width : bld.height) + 2
  }

  return parcels
}

// ---------------------------------------------------------------------------
// Decoration Generation
// ---------------------------------------------------------------------------

function generateDecorations(
  bounds: { x: number; y: number; w: number; h: number },
  parcels: Parcel[],
  seed: number,
): DecorationItem[] {
  const decorations: DecorationItem[] = []
  const decorItems = ['tree_green', 'bush', 'flower', 'barrel', 'crate']

  // Simple scatter: place decorations in open areas
  const step = 3 // check every 3 tiles
  for (let dx = bounds.x + 1; dx < bounds.x + bounds.w - 1; dx += step) {
    for (let dy = bounds.y + 1; dy < bounds.y + bounds.h - 1; dy += step) {
      // Skip if inside a parcel
      const inParcel = parcels.some(p =>
        dx >= p.bounds.x && dx < p.bounds.x + p.bounds.w &&
        dy >= p.bounds.y && dy < p.bounds.y + p.bounds.h
      )
      if (inParcel) continue

      const r = seededRandom(seed + dx * 41 + dy * 67)
      if (r > 0.7) {
        const item = decorItems[Math.floor(seededRandom(seed + dx + dy * 31) * decorItems.length)]!
        decorations.push({
          role: item,
          family: 'decoration',
          material: 'default',
          x: dx,
          y: dy,
        })
      }
    }
  }

  return decorations
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class DistrictParceler {
  /**
   * Plan the internal layout of a district.
   *
   * @param districtId - District identifier
   * @param bounds     - District bounds in tile coordinates
   * @param buildings  - Buildings to place (id + footprint)
   * @param seed       - Deterministic seed
   * @returns Complete district layout with roads, parcels, and decorations
   */
  static plan(
    districtId: string,
    bounds: { x: number; y: number; w: number; h: number },
    buildings: { id: string; width: number; height: number }[],
    seed: number,
  ): DistrictLayout {
    const roads = generateRoadSpine(bounds, buildings.length, seed)
    const parcels = allocateParcels(bounds, roads, buildings, seed)
    const decorations = generateDecorations(bounds, parcels, seed)

    return {
      districtId,
      roads,
      parcels,
      decorations,
      gates: roads.gates,
    }
  }
}
