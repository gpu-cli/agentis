// ============================================================================
// World Model Store — Map Entities
// Holds: Islands, Districts, Buildings, Tiles
// ============================================================================

import { create } from 'zustand'
import type {
  Island,
  District,
  Building,
  Tile,
  LocalCoord,
  DistrictConnection,
} from '@multiverse/shared'
import type { PlanetSnapshot } from '@multiverse/shared'

interface UniverseState {
  planetId: string | null
  planetName: string | null
  islands: Map<string, Island>
  districts: Map<string, District>
  buildings: Map<string, Building>
  tiles: Map<string, Tile>
  connections: DistrictConnection[]

  // Actions
  loadSnapshot: (snapshot: PlanetSnapshot) => void
  addTile: (
    tileId: string,
    buildingId: string,
    fileName: string,
    position: LocalCoord,
    agentId?: string,
  ) => void
  updateTile: (tileId: string, updates: Partial<Tile>) => void
  removeTile: (tileId: string) => void
  updateBuilding: (buildingId: string, updates: Partial<Building>) => void
  getBuildingTiles: (buildingId: string) => Tile[]
  recalcBuildingStats: (buildingId: string) => void
}

export const useUniverseStore = create<UniverseState>((set, get) => ({
  planetId: null,
  planetName: null,
  islands: new Map(),
  districts: new Map(),
  buildings: new Map(),
  tiles: new Map(),
  connections: [],

  loadSnapshot: (snapshot) => {
    const islands = new Map<string, Island>(snapshot.islands.map((i) => [i.id, i]))
    const districts = new Map<string, District>(snapshot.districts.map((d) => [d.id, d]))
    const buildings = new Map<string, Building>(snapshot.buildings.map((b) => [b.id, b]))
    const tiles = new Map<string, Tile>(snapshot.tiles.map((t) => [t.id, t]))

    set({
      planetId: snapshot.planet_id,
      planetName: snapshot.planet_name ?? null,
      islands,
      districts,
      buildings,
      tiles,
      connections: snapshot.connections ?? [],
    })
  },

  addTile: (tileId, buildingId, fileName, position, agentId) => {
    const tile: Tile = {
      id: tileId,
      building_id: buildingId,
      file_name: fileName,
      position,
      state: 'scaffolding',
      last_modified: Date.now(),
      created_by_agent: agentId,
    }
    set((state) => {
      const tiles = new Map(state.tiles)
      tiles.set(tileId, tile)
      return { tiles }
    })
    get().recalcBuildingStats(buildingId)
  },

  updateTile: (tileId, updates) => {
    set((state) => {
      const tiles = new Map(state.tiles)
      const existing = tiles.get(tileId)
      if (existing) {
        tiles.set(tileId, { ...existing, ...updates, last_modified: Date.now() })
      }
      return { tiles }
    })
    const tile = get().tiles.get(tileId)
    if (tile) {
      get().recalcBuildingStats(tile.building_id)
    }
  },

  removeTile: (tileId) => {
    const tile = get().tiles.get(tileId)
    set((state) => {
      const tiles = new Map(state.tiles)
      tiles.delete(tileId)
      return { tiles }
    })
    if (tile) {
      get().recalcBuildingStats(tile.building_id)
    }
  },

  updateBuilding: (buildingId, updates) => {
    set((state) => {
      const buildings = new Map(state.buildings)
      const existing = buildings.get(buildingId)
      if (existing) {
        buildings.set(buildingId, { ...existing, ...updates })
      }
      return { buildings }
    })
  },

  getBuildingTiles: (buildingId) => {
    const tiles: Tile[] = []
    for (const tile of get().tiles.values()) {
      if (tile.building_id === buildingId) {
        tiles.push(tile)
      }
    }
    return tiles
  },

  recalcBuildingStats: (buildingId) => {
    const building = get().buildings.get(buildingId)
    if (!building) return

    const tiles = get().getBuildingTiles(buildingId)
    const file_count = tiles.length
    const completeCount = tiles.filter(
      (t) => t.state === 'complete' || t.state === 'building',
    ).length
    const health = file_count > 0 ? Math.round((completeCount / file_count) * 100) : 0

    // Grow footprint based on tile count (tiles = files)
    // S: 2x2 (≤2 files), M: 3x2 (≤6), L: 3x3 (≤9), XL: 4x3 (>9)
    const footprint = file_count <= 2
      ? { width: 2, height: 2 }
      : file_count <= 6
        ? { width: 3, height: 2 }
        : file_count <= 9
          ? { width: 3, height: 3 }
          : { width: 4, height: 3 }

    // Only update footprint if it grew (never shrink — files may be temporarily removed)
    const newFootprint =
      footprint.width * footprint.height > building.footprint.width * building.footprint.height
        ? footprint
        : building.footprint

    get().updateBuilding(buildingId, { file_count, health, footprint: newFootprint })
  },
}))
