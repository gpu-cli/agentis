// ============================================================================
// Phase 5: Deterministic Layout Solver
// Districts use squarified treemap (area ∝ usedCapacity) for proportional sizing.
// Buildings use stable grid placement (sorted by ID for determinism).
// Islands use row-major grid packing.
// ============================================================================

import type { WMWorld, WMIsland, WMDistrict, WMBuilding } from './types'

const PADDING = 3 // tile-units of padding inside containers
const SPACING = 2 // tile-units between siblings (prevents visual merging of building walls)

// ---------------------------------------------------------------------------
// Transition metadata
// ---------------------------------------------------------------------------

/** Metadata hints for the renderer to animate layout transitions */
export interface LayoutTransitionMeta {
  /** Duration in ms for the tween */
  tweenDurationMs: number
  /** Easing function name (CSS-compatible) */
  easing: 'ease-out' | 'ease-in-out' | 'linear'
  /** Whether this was a reflow (true) or stable (false) */
  reflowed: boolean
}

/** Minimum change in aggregate size (ratio) to trigger subtree reflow.
 *  Smaller changes keep prior bounds to avoid visual thrash. */
const REFLOW_THRESHOLD = 0.10 // 10%

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Assign non-overlapping LayoutRects to every node in the world hierarchy.
 * Uses shelf (row) packing. Deterministic: same input → same output.
 */
export function solveLayout(world: WMWorld): number {
  let iterations = 0

  // Step 1: Solve buildings within each district (bottom-up)
  for (const island of world.islands) {
    for (const district of island.districts) {
      packBuildingsInDistrict(district)
      iterations++
    }
  }

  // Step 2: Solve districts within each island
  for (const island of world.islands) {
    packDistrictsInIsland(island)
    iterations++
  }

  // Step 3: Solve islands within world
  packIslandsInWorld(world)
  iterations++

  return iterations
}

// ---------------------------------------------------------------------------
// Incremental layout solver with reflow thresholding
// ---------------------------------------------------------------------------

/**
 * Incremental layout solver. Compares each subtree's usedCapacity against
 * the previous world and only re-packs subtrees whose capacity changed by
 * more than REFLOW_THRESHOLD (10%). Subtrees below the threshold keep their
 * prior layout bounds.
 *
 * Returns the number of solver iterations and a map of node IDs to
 * LayoutTransitionMeta describing whether each node reflowed.
 */
export function solveLayoutIncremental(
  world: WMWorld,
  previousWorld: WMWorld,
): { iterations: number; transitions: Map<string, LayoutTransitionMeta> } {
  let iterations = 0
  const transitions = new Map<string, LayoutTransitionMeta>()

  // Build lookup maps from previous world for fast access
  const prevDistrictMap = new Map<string, WMDistrict>()
  const prevIslandMap = new Map<string, WMIsland>()
  for (const island of previousWorld.islands) {
    prevIslandMap.set(island.id, island)
    for (const district of island.districts) {
      prevDistrictMap.set(district.id, district)
    }
  }

  // Step 1: Solve buildings within each district (bottom-up)
  for (const island of world.islands) {
    for (const district of island.districts) {
      const prevDistrict = prevDistrictMap.get(district.id)
      if (prevDistrict && !exceedsThreshold(district.usedCapacity, prevDistrict.usedCapacity)) {
        // Below threshold — copy prior layout bounds for district and its buildings
        copyDistrictLayout(district, prevDistrict)
        markStable(transitions, district)
      } else {
        packBuildingsInDistrict(district)
        markReflowed(transitions, district)
      }
      iterations++
    }
  }

  // Step 2: Solve districts within each island
  for (const island of world.islands) {
    const prevIsland = prevIslandMap.get(island.id)
    if (prevIsland && !exceedsThreshold(island.usedCapacity, prevIsland.usedCapacity)) {
      // Below threshold — copy prior island layout and district positions
      copyIslandLayout(island, prevIsland)
      markStable(transitions, island)
    } else {
      packDistrictsInIsland(island)
      markReflowed(transitions, island)
    }
    iterations++
  }

  // Step 3: Solve islands within world
  if (!exceedsThreshold(world.usedCapacity, previousWorld.usedCapacity)) {
    copyWorldLayout(world, previousWorld)
    markStable(transitions, world)
  } else {
    packIslandsInWorld(world)
    markReflowed(transitions, world)
  }
  iterations++

  return { iterations, transitions }
}

// ---------------------------------------------------------------------------
// Threshold helpers
// ---------------------------------------------------------------------------

function exceedsThreshold(newCapacity: number, oldCapacity: number): boolean {
  const ratio = Math.abs(newCapacity - oldCapacity) / Math.max(oldCapacity, 1)
  return ratio >= REFLOW_THRESHOLD
}

function markStable(transitions: Map<string, LayoutTransitionMeta>, node: { id: string }): void {
  transitions.set(node.id, {
    tweenDurationMs: 300,
    easing: 'ease-out',
    reflowed: false,
  })
}

function markReflowed(transitions: Map<string, LayoutTransitionMeta>, node: { id: string }): void {
  transitions.set(node.id, {
    tweenDurationMs: 500,
    easing: 'ease-in-out',
    reflowed: true,
  })
}

// ---------------------------------------------------------------------------
// Layout copy helpers (used when a subtree is below reflow threshold)
// ---------------------------------------------------------------------------

function copyDistrictLayout(district: WMDistrict, prev: WMDistrict): void {
  district.layout = { ...prev.layout }
  const prevBuildingMap = new Map(prev.buildings.map(b => [b.id, b]))
  for (const building of district.buildings) {
    const prevBuilding = prevBuildingMap.get(building.id)
    if (prevBuilding) {
      building.layout = { ...prevBuilding.layout }
    }
  }
}

function copyIslandLayout(island: WMIsland, prev: WMIsland): void {
  island.layout = { ...prev.layout }
  const prevDistrictMap = new Map(prev.districts.map(d => [d.id, d]))
  for (const district of island.districts) {
    const prevDistrict = prevDistrictMap.get(district.id)
    if (prevDistrict) {
      district.layout = { ...district.layout, x: prevDistrict.layout.x, y: prevDistrict.layout.y }
    }
  }
}

function copyWorldLayout(world: WMWorld, prev: WMWorld): void {
  world.layout = { ...prev.layout }
  const prevIslandMap = new Map(prev.islands.map(i => [i.id, i]))
  for (const island of world.islands) {
    const prevIsland = prevIslandMap.get(island.id)
    if (prevIsland) {
      island.layout = { ...island.layout, x: prevIsland.layout.x, y: prevIsland.layout.y }
    }
  }
}

// ---------------------------------------------------------------------------
// Building packing within a district — Stable grid placement
// ---------------------------------------------------------------------------

/**
 * Pack buildings in a district using a stable grid layout.
 * Buildings are sorted by ID (deterministic) and placed in row-major order.
 * This ensures that adding/removing a building only affects positions of
 * buildings that come after it — stable keys for existing buildings.
 *
 * When `preserveDistrictSize` is true (treemap path), buildings are packed
 * within the existing district bounds — the district width/height are NOT
 * overridden. When false (standalone path), the district is resized to fit.
 */
function packBuildingsInDistrict(district: WMDistrict, preserveDistrictSize = false): void {
  const buildings = district.buildings
  if (buildings.length === 0) {
    if (!preserveDistrictSize) {
      district.layout = { ...district.layout, width: PADDING * 2 + 2, height: PADDING * 2 + 2 }
    }
    return
  }

  // Sort by ID for stable, deterministic ordering
  const sorted = [...buildings].sort((a, b) => a.id.localeCompare(b.id))

  let containerWidth: number
  if (preserveDistrictSize) {
    // Use existing district width (set by treemap) as the container constraint
    containerWidth = district.layout.width
  } else {
    // Estimate container width from building areas
    const totalArea = sorted.reduce((s, b) => s + (b.layout.width + SPACING) * (b.layout.height + SPACING), 0)
    const estSide = Math.ceil(Math.sqrt(totalArea)) + PADDING * 2
    containerWidth = Math.max(estSide, (sorted[0]?.layout.width ?? 2) + PADDING * 2 + SPACING)
  }

  // Pack using shelf algorithm
  const result = shelfPack(sorted, containerWidth, PADDING, SPACING)

  // Apply positions back to buildings (district-relative coordinates)
  for (const placement of result.placements) {
    placement.building.layout = {
      ...placement.building.layout,
      x: placement.x,
      y: placement.y,
    }
  }

  if (!preserveDistrictSize) {
    district.layout = {
      ...district.layout,
      width: result.containerWidth,
      height: result.containerHeight,
    }
  }
}

// ---------------------------------------------------------------------------
// District packing within an island — Squarified Treemap
// ---------------------------------------------------------------------------

/**
 * Pack districts into the island using a squarified treemap algorithm.
 * Each district's area is proportional to its usedCapacity (activity mass),
 * with a minimum area guaranteed by first packing buildings to determine
 * each district's actual footprint.
 *
 * This produces visually balanced, roughly-square rectangles that convey
 * relative code activity at a glance.
 */
function packDistrictsInIsland(island: WMIsland): void {
  const districts = island.districts
  if (districts.length === 0) {
    island.layout = { ...island.layout, width: PADDING * 2 + 4, height: PADDING * 2 + 4 }
    return
  }

  // Step 1: Pack buildings in each district first to determine minimum footprint.
  // This sets district.layout.width and height to the packed building footprint.
  for (const d of districts) {
    packBuildingsInDistrict(d)
  }

  // Step 2: Compute treemap weights.
  // Use actual packed area as the floor weight, scaled by usedCapacity for
  // districts with heavy activity (they get proportionally more visual space).
  const districtAreas = districts.map(d => d.layout.width * d.layout.height)
  const weights = districts.map((d, i) => {
    const baseArea = districtAreas[i]!
    // Scale up districts with high activity: area × (1 + log2(capacity))
    const capacityBoost = d.usedCapacity > 0 ? 1 + Math.log2(1 + d.usedCapacity) : 1
    return baseArea * capacityBoost
  })
  const totalWeight = weights.reduce((s, w) => s + w, 0)

  // Step 3: Compute container size from the treemap weights.
  // Total area must accommodate all districts including spacing between them.
  // Each district needs its packed area + spacing borders.
  const totalBaseArea = districtAreas.reduce((s, a) => s + a, 0)
  const spacingPerDistrict = SPACING * 2 // spacing on each side
  const spacingAreaOverhead = districts.reduce(
    (s, d) => s + (d.layout.width + spacingPerDistrict) * spacingPerDistrict
      + (d.layout.height + spacingPerDistrict) * spacingPerDistrict,
    0,
  )
  const adjustedTotal = totalBaseArea + spacingAreaOverhead
  // Also ensure each district's max dimension fits: the container side must be
  // at least as large as the widest/tallest district + padding + spacing
  const maxDistrictDim = Math.max(
    ...districts.map(d => Math.max(d.layout.width, d.layout.height) + SPACING * 2),
  )
  const containerSide = Math.max(
    Math.ceil(Math.sqrt(adjustedTotal * 1.2)) + PADDING * 2,
    maxDistrictDim + PADDING * 2,
    PADDING * 2 + 8,
  )
  const containerWidth = containerSide
  const containerHeight = containerSide

  // Step 4: Run squarified treemap on the padded inner area.
  const innerX = PADDING
  const innerY = PADDING
  const innerW = containerWidth - PADDING * 2
  const innerH = containerHeight - PADDING * 2

  const placements = squarifiedTreemap(
    districts.map((d, i) => ({ item: d, weight: weights[i]! })),
    { x: innerX, y: innerY, width: Math.max(innerW, 4), height: Math.max(innerH, 4) },
    totalWeight,
  )

  // Step 5: Apply treemap placements.
  // Each district gets the treemap-assigned position. Its size is the MAX of
  // treemap cell and packed building footprint, ensuring buildings always fit.
  for (const p of placements) {
    const d = p.item
    // Inset each cell by SPACING on each side to create gaps between districts
    const inset = SPACING
    const cellW = Math.max(p.width - inset * 2, 0)
    const cellH = Math.max(p.height - inset * 2, 0)

    // Use the larger of treemap cell or packed building footprint
    d.layout = {
      ...d.layout,
      x: p.x + inset,
      y: p.y + inset,
      width: Math.max(cellW, d.layout.width),
      height: Math.max(cellH, d.layout.height),
    }
  }

  island.layout = {
    ...island.layout,
    width: containerWidth,
    height: containerHeight,
  }
}

// ---------------------------------------------------------------------------
// Squarified Treemap Algorithm
// ---------------------------------------------------------------------------

interface TreemapItem<T> {
  item: T
  weight: number
}

interface TreemapPlacement<T> {
  item: T
  x: number
  y: number
  width: number
  height: number
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Squarified treemap layout — Bruls, Huizing, van Wijk (2000).
 * Produces rectangles with aspect ratios as close to 1:1 as possible.
 *
 * Uses integer-snapped rounding: positions and sizes are integers,
 * computed via cumulative rounding to prevent gaps/overlaps.
 *
 * Items are sorted by weight descending for determinism and optimal squarification.
 */
function squarifiedTreemap<T>(
  items: TreemapItem<T>[],
  bounds: Rect,
  totalWeight: number,
): TreemapPlacement<T>[] {
  if (items.length === 0) return []
  if (items.length === 1) {
    return [{
      item: items[0]!.item,
      x: Math.floor(bounds.x),
      y: Math.floor(bounds.y),
      width: Math.floor(bounds.width),
      height: Math.floor(bounds.height),
    }]
  }

  // Sort by weight descending (deterministic, stable by reference order for ties)
  const sorted = [...items].sort((a, b) => b.weight - a.weight)

  const placements: TreemapPlacement<T>[] = []
  layoutStrip(sorted, bounds, totalWeight, placements)
  return placements
}

/**
 * Recursively lay out items into the remaining rectangle.
 * Greedily adds items to the current strip while the worst aspect ratio improves.
 * Uses integer-snapped coordinates to prevent fractional overlap.
 */
function layoutStrip<T>(
  items: TreemapItem<T>[],
  rect: Rect,
  totalWeight: number,
  out: TreemapPlacement<T>[],
): void {
  if (items.length === 0) return

  // Snap rect to integers for clean boundaries
  const rx = Math.floor(rect.x)
  const ry = Math.floor(rect.y)
  const rw = Math.floor(rect.width)
  const rh = Math.floor(rect.height)

  if (rw <= 0 || rh <= 0) {
    // Degenerate — assign zero-area placements
    for (const item of items) {
      out.push({ item: item.item, x: rx, y: ry, width: 0, height: 0 })
    }
    return
  }

  if (items.length === 1) {
    out.push({ item: items[0]!.item, x: rx, y: ry, width: rw, height: rh })
    return
  }

  // Short side of the rectangle determines strip direction
  const isWide = rw >= rh
  const shortSide = isWide ? rh : rw

  // Greedily build the strip
  const strip: TreemapItem<T>[] = [items[0]!]
  let stripWeight = items[0]!.weight
  let bestWorst = worstAspect(strip, stripWeight, shortSide, totalWeight, rw, rh)

  let splitIdx = 1
  while (splitIdx < items.length) {
    const candidate = items[splitIdx]!
    const newStripWeight = stripWeight + candidate.weight
    // Temporarily add to check aspect ratio
    strip.push(candidate)
    const newWorst = worstAspect(strip, newStripWeight, shortSide, totalWeight, rw, rh)

    if (newWorst <= bestWorst) {
      stripWeight = newStripWeight
      bestWorst = newWorst
      splitIdx++
    } else {
      strip.pop() // remove candidate
      break
    }
  }

  // Lay out the strip with integer-snapped coordinates
  const stripFraction = stripWeight / totalWeight
  const totalArea = rw * rh

  if (isWide) {
    // Vertical strip on the left; strip width = area / height
    const stripWidth = Math.round((totalArea * stripFraction) / rh)

    // Place items along the height with cumulative integer rounding
    let cumY = ry
    for (let si = 0; si < strip.length; si++) {
      const nextCumY = si === strip.length - 1
        ? ry + rh // last item takes remainder — no gaps
        : Math.round(ry + rh * cumulativeWeight(strip, si + 1) / stripWeight)
      const itemHeight = nextCumY - cumY
      out.push({ item: strip[si]!.item, x: rx, y: cumY, width: stripWidth, height: itemHeight })
      cumY = nextCumY
    }

    // Recurse on the remaining rectangle (right portion)
    const remaining = items.slice(splitIdx)
    if (remaining.length > 0) {
      layoutStrip(
        remaining,
        { x: rx + stripWidth, y: ry, width: rw - stripWidth, height: rh },
        totalWeight - stripWeight,
        out,
      )
    }
  } else {
    // Horizontal strip on the top; strip height = area / width
    const stripHeight = Math.round((totalArea * stripFraction) / rw)

    // Place items along the width with cumulative integer rounding
    let cumX = rx
    for (let si = 0; si < strip.length; si++) {
      const nextCumX = si === strip.length - 1
        ? rx + rw
        : Math.round(rx + rw * cumulativeWeight(strip, si + 1) / stripWeight)
      const itemWidth = nextCumX - cumX
      out.push({ item: strip[si]!.item, x: cumX, y: ry, width: itemWidth, height: stripHeight })
      cumX = nextCumX
    }

    // Recurse on the remaining rectangle (bottom portion)
    const remaining = items.slice(splitIdx)
    if (remaining.length > 0) {
      layoutStrip(
        remaining,
        { x: rx, y: ry + stripHeight, width: rw, height: rh - stripHeight },
        totalWeight - stripWeight,
        out,
      )
    }
  }
}

/** Sum weights of the first `count` items in the strip */
function cumulativeWeight<T>(strip: TreemapItem<T>[], count: number): number {
  let sum = 0
  for (let i = 0; i < count; i++) sum += strip[i]!.weight
  return sum
}

/**
 * Compute the worst (highest) aspect ratio of items if laid out in a strip
 * along the given short side. Lower is better (1.0 = perfect square).
 */
function worstAspect<T>(
  strip: TreemapItem<T>[],
  stripWeight: number,
  shortSide: number,
  totalWeight: number,
  containerW: number,
  containerH: number,
): number {
  if (shortSide <= 0 || totalWeight <= 0) return Infinity

  const totalArea = containerW * containerH
  const stripFraction = stripWeight / totalWeight
  const stripArea = totalArea * stripFraction
  const stripThickness = stripArea / shortSide

  let worst = 0
  for (const item of strip) {
    const itemFraction = item.weight / stripWeight
    const itemLength = shortSide * itemFraction
    const aspect = itemLength > 0 && stripThickness > 0
      ? Math.max(itemLength / stripThickness, stripThickness / itemLength)
      : Infinity
    worst = Math.max(worst, aspect)
  }

  return worst
}

// ---------------------------------------------------------------------------
// Island packing within world (row-major grid)
// ---------------------------------------------------------------------------

function packIslandsInWorld(world: WMWorld): void {
  const islands = world.islands
  if (islands.length === 0) {
    world.layout = { x: 0, y: 0, width: 10, height: 10 }
    return
  }

  // Simple grid layout for islands
  const cols = Math.ceil(Math.sqrt(islands.length))
  const islandSpacing = 4 // generous spacing between islands

  let currentX = PADDING
  let currentY = PADDING
  let rowHeight = 0
  let maxX = 0
  let col = 0

  for (const island of islands) {
    if (col >= cols) {
      currentX = PADDING
      currentY += rowHeight + islandSpacing
      rowHeight = 0
      col = 0
    }

    island.layout = { ...island.layout, x: currentX, y: currentY }
    currentX += island.layout.width + islandSpacing
    maxX = Math.max(maxX, currentX)
    rowHeight = Math.max(rowHeight, island.layout.height)
    col++
  }

  world.layout = {
    x: 0,
    y: 0,
    width: maxX + PADDING,
    height: currentY + rowHeight + PADDING,
  }
}

// ---------------------------------------------------------------------------
// Generic shelf packing
// ---------------------------------------------------------------------------

interface ShelfPlacement<T> {
  item: T
  x: number
  y: number
}

interface ShelfResult<T> {
  placements: ShelfPlacement<T>[]
  containerWidth: number
  containerHeight: number
}

function shelfPackGeneric<T>(
  items: Array<{ item: T; width: number; height: number }>,
  containerWidth: number,
  padding: number,
  spacing: number,
): ShelfResult<T> {
  const placements: ShelfPlacement<T>[] = []
  let curX = padding
  let curY = padding
  let shelfHeight = 0
  let maxX = 0

  for (const entry of items) {
    const w = entry.width + spacing
    const h = entry.height + spacing

    if (curX + entry.width > containerWidth - padding && curX > padding) {
      // New shelf
      curX = padding
      curY += shelfHeight
      shelfHeight = 0
    }

    placements.push({ item: entry.item, x: curX, y: curY })
    curX += w
    maxX = Math.max(maxX, curX)
    shelfHeight = Math.max(shelfHeight, h)
  }

  return {
    placements,
    containerWidth: Math.max(containerWidth, maxX + padding),
    containerHeight: curY + shelfHeight + padding,
  }
}

interface BuildingPlacement {
  building: WMBuilding
  x: number
  y: number
}

function shelfPack(
  buildings: WMBuilding[],
  containerWidth: number,
  padding: number,
  spacing: number,
): { placements: BuildingPlacement[]; containerWidth: number; containerHeight: number } {
  const result = shelfPackGeneric(
    buildings.map(b => ({ item: b, width: b.layout.width, height: b.layout.height })),
    containerWidth,
    padding,
    spacing,
  )

  return {
    placements: result.placements.map(p => ({
      building: p.item as WMBuilding,
      x: p.x,
      y: p.y,
    })),
    containerWidth: result.containerWidth,
    containerHeight: result.containerHeight,
  }
}
