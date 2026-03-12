// ============================================================================
// Autotile Engine — Bitmask-based neighbor-aware tile selection
//
// Pure function module. Examines cardinal neighbors and selects the correct
// tile role for district walls and roads using 4-bit bitmask autotiling.
//
// Bit assignments:
//   N (north) = bit 0 → value 1
//   E (east)  = bit 1 → value 2
//   S (south) = bit 2 → value 4
//   W (west)  = bit 3 → value 8
//
// Replaces:
//   - TilemapManager.ts L1013–1094 (district walls: wrong tiles, no neighbors)
//   - TilemapManager.ts L1263–1411 (roads: single texture, no autotiling)
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single autotiled wall tile with position and role */
export interface WallTile {
  /** Tile grid x position (pixels) */
  x: number
  /** Tile grid y position (pixels) */
  y: number
  /** Resolved role from bitmask table */
  role: string
  /** Whether this is a gate tile */
  isGate: boolean
}

/** A resolved road tile with position, role, and rotation */
export interface RoadTileResult {
  /** Tile grid x position (pixels) */
  x: number
  /** Tile grid y position (pixels) */
  y: number
  /** Resolved road role */
  role: string
  /** Rotation in radians for tiles that need rotation */
  rotation: number
}

// ---------------------------------------------------------------------------
// Bitmask Tables
// ---------------------------------------------------------------------------

/**
 * Wall bitmask → role mapping.
 * 4-bit mask: N(1) E(2) S(4) W(8) → 16 possible configurations.
 */
const WALL_BITMASK_TABLE: Record<number, string> = {
  0:  'isolated',     // ○ ○ ○ ○  Standalone wall post
  1:  'end_s',        // ● ○ ○ ○  N only → dead end pointing south
  2:  'end_w',        // ○ ● ○ ○  E only → dead end pointing west
  3:  'corner_sw',    // ● ● ○ ○  N + E → outer corner (SW turn)
  4:  'end_n',        // ○ ○ ● ○  S only → dead end pointing north
  5:  'straight_v',   // ● ○ ● ○  N + S → vertical straight
  6:  'corner_nw',    // ○ ● ● ○  E + S → outer corner (NW turn)
  7:  't_w',          // ● ● ● ○  N + E + S → T-junction (opening west)
  8:  'end_e',        // ○ ○ ○ ●  W only → dead end pointing east
  9:  'corner_se',    // ● ○ ○ ●  N + W → outer corner (SE turn)
  10: 'straight_h',   // ○ ● ○ ●  E + W → horizontal straight
  11: 't_s',          // ● ● ○ ●  N + E + W → T-junction (opening south)
  12: 'corner_ne',    // ○ ○ ● ●  S + W → outer corner (NE turn)
  13: 't_e',          // ● ○ ● ●  N + S + W → T-junction (opening east)
  14: 't_n',          // ○ ● ● ●  E + S + W → T-junction (opening north)
  15: 'cross',        // ● ● ● ●  All four → cross intersection
}

/**
 * Road bitmask → role mapping.
 * Same 4-bit mask as walls.
 */
const ROAD_BITMASK_TABLE: Record<number, string> = {
  0:  'isolated',
  1:  'end_s',
  2:  'end_w',
  3:  'turn_sw',     // N + E
  4:  'end_n',
  5:  'straight_v',  // N + S
  6:  'turn_nw',     // E + S
  7:  't_w',         // N + E + S
  8:  'end_e',
  9:  'turn_se',     // N + W
  10: 'straight_h',  // E + W
  11: 't_s',         // N + E + W
  12: 'turn_ne',     // S + W
  13: 't_e',         // N + S + W
  14: 't_n',         // E + S + W
  15: 'cross',       // all four
}

// ---------------------------------------------------------------------------
// Wall Autotiling
// ---------------------------------------------------------------------------

/**
 * Compute the 4-bit bitmask for a position given a neighbor-check function.
 */
function computeBitmask(
  x: number,
  y: number,
  hasNeighbor: (x: number, y: number) => boolean,
  tileSize: number,
): number {
  let mask = 0
  if (hasNeighbor(x, y - tileSize)) mask |= 1  // N
  if (hasNeighbor(x + tileSize, y)) mask |= 2  // E
  if (hasNeighbor(x, y + tileSize)) mask |= 4  // S
  if (hasNeighbor(x - tileSize, y)) mask |= 8  // W
  return mask
}

/**
 * Generate the wall perimeter tiles for a district's bounding box.
 * Walks the edges at tile-size intervals and computes bitmask for each position.
 */
function generateWallPerimeter(
  bounds: { x: number; y: number; w: number; h: number },
  tileSize: number,
): WallTile[] {
  const wallSet = new Set<string>()

  // Use floor so the perimeter never exceeds the supplied bounds.
  // Previously ceil caused the right/bottom wall to overshoot by up to
  // (tileSize - 1) pixels, creating an untiled gap inside the district.
  const cols = Math.max(1, Math.floor(bounds.w / tileSize))
  const rows = Math.max(1, Math.floor(bounds.h / tileSize))

  for (let c = 0; c <= cols; c++) {
    const x = bounds.x + c * tileSize
    wallSet.add(`${x},${bounds.y}`)
    wallSet.add(`${x},${bounds.y + rows * tileSize}`)
  }
  for (let r = 1; r < rows; r++) {
    const y = bounds.y + r * tileSize
    wallSet.add(`${bounds.x},${y}`)
    wallSet.add(`${bounds.x + cols * tileSize},${y}`)
  }

  // Compute bitmask for each position
  const isWall = (x: number, y: number) => wallSet.has(`${x},${y}`)
  const tiles: WallTile[] = []

  for (const key of wallSet) {
    const parts = key.split(',')
    const x = Number(parts[0])
    const y = Number(parts[1])
    const mask = computeBitmask(x, y, isWall, tileSize)

    tiles.push({
      x,
      y,
      role: WALL_BITMASK_TABLE[mask]!,
      isGate: false,
    })
  }

  return tiles
}

/**
 * Place gates at wall-road intersection points.
 */
function placeGates(
  wallTiles: WallTile[],
  roadIntersections: { x: number; y: number; direction: 'h' | 'v' }[],
  biomeMaterial: string,
): WallTile[] {
  for (const intersection of roadIntersections) {
    // Find closest wall tile(s) to the road intersection
    const closest = wallTiles
      .filter(t => !t.isGate)
      .sort((a, b) => {
        const da = Math.abs(a.x - intersection.x) + Math.abs(a.y - intersection.y)
        const db = Math.abs(b.x - intersection.x) + Math.abs(b.y - intersection.y)
        return da - db
      })

    if (closest.length === 0) continue

    // Replace 1 wall tile with a gate
    const gate = closest[0]!
    gate.role = intersection.direction === 'h' ? 'gate_h' : 'gate_v'
    gate.isGate = true

    // For castle/fortress biomes with 2×2 gates, mark adjacent tile too
    if (biomeMaterial === 'castle' || biomeMaterial === 'fortress') {
      if (closest.length >= 2) {
        const gate2 = closest[1]!
        gate2.role = intersection.direction === 'h' ? 'gate_h' : 'gate_v'
        gate2.isGate = true
      }
    }
  }

  return wallTiles
}

// ---------------------------------------------------------------------------
// Road Autotiling
// ---------------------------------------------------------------------------

/**
 * Discretize continuous road waypoints onto a tile grid.
 * Returns a Set of "x,y" grid-aligned positions.
 */
function discretizeRoads(
  allWaypoints: { x: number; y: number }[][],
  tileSize: number,
): Set<string> {
  const cells = new Set<string>()

  for (const waypoints of allWaypoints) {
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i]!
      const b = waypoints[i + 1]!

      // Rasterize segment onto tile grid
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.sqrt(dx * dx + dy * dy)
      const steps = Math.max(1, Math.ceil(len / tileSize))

      for (let s = 0; s <= steps; s++) {
        const t = steps === 0 ? 0 : s / steps
        const px = a.x + dx * t
        const py = a.y + dy * t
        const gx = Math.floor(px / tileSize) * tileSize
        const gy = Math.floor(py / tileSize) * tileSize
        cells.add(`${gx},${gy}`)
      }
    }
  }

  return cells
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class AutotileEngine {
  /**
   * Resolve the wall role for a position based on cardinal neighbors.
   */
  static resolveWallRole(
    x: number,
    y: number,
    isWall: (x: number, y: number) => boolean,
    tileSize: number,
  ): string {
    const mask = computeBitmask(x, y, isWall, tileSize)
    return WALL_BITMASK_TABLE[mask]!
  }

  /**
   * Resolve the road role and rotation for a position based on neighbors.
   */
  static resolveRoadTile(
    gx: number,
    gy: number,
    isRoad: (x: number, y: number) => boolean,
    tileSize: number,
  ): { role: string; rotation: number } {
    const mask = computeBitmask(gx, gy, isRoad, tileSize)
    return {
      role: ROAD_BITMASK_TABLE[mask]!,
      rotation: 0, // Rotation not needed — atlas has all directional variants
    }
  }

  /**
   * Generate a complete autotiled wall perimeter for a district.
   */
  static generateDistrictWalls(
    bounds: { x: number; y: number; w: number; h: number },
    tileSize: number,
    roadIntersections: { x: number; y: number; direction: 'h' | 'v' }[],
    biomeMaterial: string,
  ): WallTile[] {
    const perimeter = generateWallPerimeter(bounds, tileSize)
    return placeGates(perimeter, roadIntersections, biomeMaterial, )
  }

  /**
   * Generate a complete autotiled road grid.
   * Returns a Map of "x,y" → { role, rotation } for each road tile.
   */
  static generateRoadGrid(
    allWaypoints: { x: number; y: number }[][],
    tileSize: number,
  ): Map<string, RoadTileResult> {
    const cells = discretizeRoads(allWaypoints, tileSize)
    const isRoad = (x: number, y: number) => cells.has(`${x},${y}`)
    const result = new Map<string, RoadTileResult>()

    for (const key of cells) {
      const parts = key.split(',')
      const gx = Number(parts[0])
      const gy = Number(parts[1])
      const { role, rotation } = AutotileEngine.resolveRoadTile(gx, gy, isRoad, tileSize)
      result.set(key, { x: gx, y: gy, role, rotation })
    }

    return result
  }

  /**
   * Map an abstract wall role to the closest Kenney tile role.
   * The Kenney tileset has TL/TR/BL/BR corners but no dedicated edge tiles,
   * so we approximate edges with corners.
   */
  static wallRoleToAtlasRole(role: string): string {
    switch (role) {
      case 'straight_h':
      case 't_n':
      case 't_s':
      case 'cross':
      case 'isolated':
        return 'wall_tl'
      case 'straight_v':
      case 't_e':
      case 't_w':
        return 'wall_tr'
      case 'corner_ne':
        return 'wall_br'
      case 'corner_nw':
        return 'wall_bl'
      case 'corner_se':
        return 'wall_tr'
      case 'corner_sw':
        return 'wall_tl'
      case 'end_n':
        return 'wall_bl'
      case 'end_s':
        return 'wall_tl'
      case 'end_e':
        return 'wall_tr'
      case 'end_w':
        return 'wall_bl'
      case 'gate_h':
      case 'gate_v':
        return 'door'
      default:
        return 'wall_tl'
    }
  }
}
