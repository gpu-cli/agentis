// ============================================================================
// Fog of War — Data layer + visibility state tests (hq-gij.3.2)
//
// Tests the fog state logic (visibility, exploration memory, vision radius)
// without requiring PixiJS rendering. FogOfWar depends on Zustand stores and
// PixiJS Graphics, so we test the coordinate math and state classification
// via the standalone data helpers extracted here.
// ============================================================================

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Extracted data helpers (mirrors FogOfWar coordinate math)
// ---------------------------------------------------------------------------

const TILE_SIZE = 32
const CHUNK_SIZE = 64

interface WorldCoord {
  chunk_x: number
  chunk_y: number
  local_x: number
  local_y: number
}

type FogState = 'void' | 'fog' | 'visible'

function worldToPixel(coord: WorldCoord): { x: number; y: number } {
  return {
    x: (coord.chunk_x * CHUNK_SIZE + coord.local_x) * TILE_SIZE,
    y: (coord.chunk_y * CHUNK_SIZE + coord.local_y) * TILE_SIZE,
  }
}

function coordKey(x: number, y: number): string {
  return `${x},${y}`
}

function pixelToTile(px: number, py: number): { tileX: number; tileY: number } {
  return {
    tileX: Math.floor(px / TILE_SIZE),
    tileY: Math.floor(py / TILE_SIZE),
  }
}

interface SimpleAgent {
  position: WorldCoord
  vision_radius: number
  status: 'active' | 'idle'
}

function isInVisionRadius(agent: SimpleAgent, worldX: number, worldY: number): boolean {
  const { tileX, tileY } = pixelToTile(worldX, worldY)
  const ax = agent.position.chunk_x * CHUNK_SIZE + agent.position.local_x
  const ay = agent.position.chunk_y * CHUNK_SIZE + agent.position.local_y
  const dx = tileX - ax
  const dy = tileY - ay
  return dx * dx + dy * dy <= agent.vision_radius * agent.vision_radius
}

function computeVisitedTiles(agent: SimpleAgent): Set<string> {
  const visited = new Set<string>()
  const cx = agent.position.chunk_x * CHUNK_SIZE + agent.position.local_x
  const cy = agent.position.chunk_y * CHUNK_SIZE + agent.position.local_y
  const r = agent.vision_radius

  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      if (dx * dx + dy * dy <= r * r) {
        visited.add(coordKey(cx + dx, cy + dy))
      }
    }
  }
  return visited
}

function getFogState(
  agents: SimpleAgent[],
  visited: Set<string>,
  worldX: number,
  worldY: number,
): FogState {
  for (const agent of agents) {
    if (isInVisionRadius(agent, worldX, worldY)) {
      return 'visible'
    }
  }

  const { tileX, tileY } = pixelToTile(worldX, worldY)
  if (visited.has(coordKey(tileX, tileY))) {
    return 'fog'
  }

  return 'void'
}

function getEffectiveVisionPixelRadius(
  agent: SimpleAgent,
  isSelected: boolean,
): number {
  const baseRadius = agent.vision_radius * TILE_SIZE
  if (isSelected) return baseRadius * 1.5
  if (agent.status === 'idle') return baseRadius * 0.4
  return baseRadius * 0.8
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fog coordinate math', () => {
  it('worldToPixel converts chunk+local to pixel coords', () => {
    const coord: WorldCoord = { chunk_x: 0, chunk_y: 0, local_x: 5, local_y: 10 }
    const pixel = worldToPixel(coord)
    expect(pixel.x).toBe(5 * TILE_SIZE)
    expect(pixel.y).toBe(10 * TILE_SIZE)
  })

  it('worldToPixel handles multi-chunk coordinates', () => {
    const coord: WorldCoord = { chunk_x: 1, chunk_y: 2, local_x: 3, local_y: 4 }
    const pixel = worldToPixel(coord)
    expect(pixel.x).toBe((1 * CHUNK_SIZE + 3) * TILE_SIZE)
    expect(pixel.y).toBe((2 * CHUNK_SIZE + 4) * TILE_SIZE)
  })

  it('pixelToTile converts back to tile coords', () => {
    const { tileX, tileY } = pixelToTile(160, 320)
    expect(tileX).toBe(5)
    expect(tileY).toBe(10)
  })

  it('pixelToTile floors fractional positions', () => {
    const { tileX, tileY } = pixelToTile(33, 63)
    expect(tileX).toBe(1)
    expect(tileY).toBe(1)
  })
})

describe('vision radius', () => {
  const agent: SimpleAgent = {
    position: { chunk_x: 0, chunk_y: 0, local_x: 10, local_y: 10 },
    vision_radius: 5,
    status: 'active',
  }

  it('detects tiles within radius', () => {
    // Agent at tile (10, 10), check tile (10, 10) — distance 0
    const px = 10 * TILE_SIZE
    const py = 10 * TILE_SIZE
    expect(isInVisionRadius(agent, px, py)).toBe(true)
  })

  it('detects tiles at edge of radius', () => {
    // Agent at (10, 10), radius 5 → (15, 10) is at distance 5
    const px = 15 * TILE_SIZE
    const py = 10 * TILE_SIZE
    expect(isInVisionRadius(agent, px, py)).toBe(true)
  })

  it('rejects tiles beyond radius', () => {
    // (16, 10) is at distance 6 > 5
    const px = 16 * TILE_SIZE
    const py = 10 * TILE_SIZE
    expect(isInVisionRadius(agent, px, py)).toBe(false)
  })

  it('uses circular distance (not Manhattan)', () => {
    // (13, 14) → distance = sqrt(9+16) = 5 — exactly on circle
    const px = 13 * TILE_SIZE
    const py = 14 * TILE_SIZE
    expect(isInVisionRadius(agent, px, py)).toBe(true)

    // (14, 14) → distance = sqrt(16+16) = 5.66 — outside
    const px2 = 14 * TILE_SIZE
    const py2 = 14 * TILE_SIZE
    expect(isInVisionRadius(agent, px2, py2)).toBe(false)
  })
})

describe('visited tiles (exploration memory)', () => {
  it('computes circular set of visited tiles', () => {
    const agent: SimpleAgent = {
      position: { chunk_x: 0, chunk_y: 0, local_x: 5, local_y: 5 },
      vision_radius: 3,
      status: 'active',
    }
    const visited = computeVisitedTiles(agent)

    // Center should be visited
    expect(visited.has(coordKey(5, 5))).toBe(true)

    // Edge tiles within radius
    expect(visited.has(coordKey(8, 5))).toBe(true) // distance 3
    expect(visited.has(coordKey(5, 8))).toBe(true)

    // Tiles outside radius
    expect(visited.has(coordKey(9, 5))).toBe(false) // distance 4
    expect(visited.has(coordKey(5, 9))).toBe(false)
  })

  it('vision radius 0 visits only center tile', () => {
    const agent: SimpleAgent = {
      position: { chunk_x: 0, chunk_y: 0, local_x: 10, local_y: 10 },
      vision_radius: 0,
      status: 'active',
    }
    const visited = computeVisitedTiles(agent)

    expect(visited.size).toBe(1)
    expect(visited.has(coordKey(10, 10))).toBe(true)
  })

  it('visited set grows with radius squared (approximately pi * r^2)', () => {
    const agent3: SimpleAgent = {
      position: { chunk_x: 0, chunk_y: 0, local_x: 50, local_y: 50 },
      vision_radius: 3,
      status: 'active',
    }
    const agent10: SimpleAgent = { ...agent3, vision_radius: 10 }

    const v3 = computeVisitedTiles(agent3)
    const v10 = computeVisitedTiles(agent10)

    // r=3 → ~28 tiles, r=10 → ~314 tiles
    expect(v3.size).toBeGreaterThan(20)
    expect(v3.size).toBeLessThan(40)
    expect(v10.size).toBeGreaterThan(250)
    expect(v10.size).toBeLessThan(400)
  })
})

describe('getFogState', () => {
  const agent: SimpleAgent = {
    position: { chunk_x: 0, chunk_y: 0, local_x: 10, local_y: 10 },
    vision_radius: 5,
    status: 'active',
  }
  const visited = computeVisitedTiles(agent)

  it('returns visible for tiles in agent vision', () => {
    const state = getFogState([agent], visited, 10 * TILE_SIZE, 10 * TILE_SIZE)
    expect(state).toBe('visible')
  })

  it('returns void for tiles never visited', () => {
    const state = getFogState([], new Set(), 100 * TILE_SIZE, 100 * TILE_SIZE)
    expect(state).toBe('void')
  })

  it('returns fog for previously visited tiles outside current vision', () => {
    // Move agent away, but keep old visited set
    const movedAgent: SimpleAgent = {
      position: { chunk_x: 0, chunk_y: 0, local_x: 50, local_y: 50 },
      vision_radius: 5,
      status: 'active',
    }

    // Tile (10, 10) was visited by original agent, not in new agent's vision
    const state = getFogState([movedAgent], visited, 10 * TILE_SIZE, 10 * TILE_SIZE)
    expect(state).toBe('fog')
  })

  it('visible takes priority over fog', () => {
    // Even if tile is in visited set, current vision wins
    const state = getFogState([agent], visited, 10 * TILE_SIZE, 10 * TILE_SIZE)
    expect(state).toBe('visible')
  })

  it('checks all agents for visibility', () => {
    const agent1: SimpleAgent = {
      position: { chunk_x: 0, chunk_y: 0, local_x: 5, local_y: 5 },
      vision_radius: 2,
      status: 'active',
    }
    const agent2: SimpleAgent = {
      position: { chunk_x: 0, chunk_y: 0, local_x: 20, local_y: 20 },
      vision_radius: 2,
      status: 'active',
    }

    // Tile (20, 20) is in agent2's vision but not agent1's
    const state = getFogState([agent1, agent2], new Set(), 20 * TILE_SIZE, 20 * TILE_SIZE)
    expect(state).toBe('visible')
  })
})

describe('effective vision pixel radius', () => {
  const agent: SimpleAgent = {
    position: { chunk_x: 0, chunk_y: 0, local_x: 10, local_y: 10 },
    vision_radius: 5,
    status: 'active',
  }

  it('active agent gets 0.8x base radius', () => {
    const radius = getEffectiveVisionPixelRadius(agent, false)
    expect(radius).toBe(5 * TILE_SIZE * 0.8)
  })

  it('selected agent gets 1.5x base radius', () => {
    const radius = getEffectiveVisionPixelRadius(agent, true)
    expect(radius).toBe(5 * TILE_SIZE * 1.5)
  })

  it('idle agent gets 0.4x base radius', () => {
    const idleAgent = { ...agent, status: 'idle' as const }
    const radius = getEffectiveVisionPixelRadius(idleAgent, false)
    expect(radius).toBe(5 * TILE_SIZE * 0.4)
  })

  it('selected takes priority over idle', () => {
    const idleAgent = { ...agent, status: 'idle' as const }
    const radius = getEffectiveVisionPixelRadius(idleAgent, true)
    expect(radius).toBe(5 * TILE_SIZE * 1.5) // selected wins
  })
})

describe('island fog bounds', () => {
  it('computes effective bounds with padding', () => {
    const islandPos: WorldCoord = { chunk_x: 0, chunk_y: 0, local_x: 10, local_y: 10 }
    const islandBounds = { width: 20, height: 15 }

    const pos = worldToPixel(islandPos)
    const PAD = 24 // matches FogOfWar.ts

    const fogBounds = {
      x: pos.x - PAD,
      y: pos.y - PAD,
      w: islandBounds.width * TILE_SIZE + PAD * 2,
      h: islandBounds.height * TILE_SIZE + PAD * 2,
    }

    expect(fogBounds.x).toBe(10 * TILE_SIZE - PAD)
    expect(fogBounds.w).toBe(20 * TILE_SIZE + 48)
    expect(fogBounds.h).toBe(15 * TILE_SIZE + 48)
  })

  it('expands to contain district with wall padding', () => {
    const islandPos: WorldCoord = { chunk_x: 0, chunk_y: 0, local_x: 10, local_y: 10 }
    const districtPos: WorldCoord = { chunk_x: 0, chunk_y: 0, local_x: 5, local_y: 5 }
    // (districtBounds intentionally omitted; padding logic validated via positions)

    const iPos = worldToPixel(islandPos)
    const dPos = worldToPixel(districtPos)
    const WALL_PAD = 20

    const minX = Math.min(iPos.x, dPos.x - WALL_PAD)
    const minY = Math.min(iPos.y, dPos.y - WALL_PAD)

    // District at (5,5) with wall padding should be less than island at (10,10)
    expect(minX).toBeLessThan(iPos.x)
    expect(minY).toBeLessThan(iPos.y)
  })
})
