// ============================================================================
// Fog of War — Dark overlay on island land, with vision circles cut out.
// Only covers island landmasses — the ocean/void is already dark.
//
// APPROACH: Uses PixiJS v8 inverse Graphics mask via setMask({ inverse: true }).
//
// Island fog polygons are drawn as normal Graphics children of the fog
// container. A single mask Graphics contains all reveal shapes (agent vision
// circles, selected building/district rects). The mask is applied with
// inverse: true, which hides the fog wherever the mask shapes are drawn —
// effectively punching clean transparent holes in the fog.
//
// This avoids both Graphics.cut() (broken tessellation) AND blendMode='erase'
// + enableRenderGroup() (produces opaque black instead of transparent holes).
//
// Per PixiJS v8 docs, Graphics masks use the stencil buffer (second fastest
// mask type) and the mask must be added to the display list.
// ============================================================================

import { Container, Graphics } from 'pixi.js'
import type { District, Island, WorldCoord } from '@multiverse/shared'
import { useAgentStore } from '../stores/agentStore'
import { useUniverseStore } from '../stores/universeStore'
import { useUIStore } from '../stores/uiStore'
import { generateCoastlinePolygon, drawPolygon, hashString, type IslandShapeTraits } from './terrain'

const TILE_SIZE = 32
const CHUNK_SIZE = 64

type FogState = 'void' | 'silhouette' | 'fog' | 'visible'

export class FogOfWar {
  container: Container
  private revealMask: Graphics
  private visited: Set<string> = new Set()
  private unsubscribeAgents: (() => void) | null = null
  private unsubscribeUI: (() => void) | null = null
  private dirty = true

  constructor() {
    this.container = new Container()
    this.container.label = 'fog-of-war'

    // Create the reveal mask Graphics — all reveal shapes are drawn here.
    // The mask must be added to the display list (per PixiJS v8 docs).
    this.revealMask = new Graphics()
    this.revealMask.label = 'fog-reveal-mask'
    this.container.addChild(this.revealMask)

    // Apply inverse mask: fog is visible everywhere EXCEPT where mask shapes
    // are drawn. This cleanly punches transparent holes without artifacts.
    this.container.setMask({ mask: this.revealMask, inverse: true })

    this.unsubscribeAgents = useAgentStore.subscribe(() => {
      this.dirty = true
    })

    // Re-render when selection changes (affects which vision circles are shown).
    let prevSelectedId: string | null = null
    let prevSelectedType: string | null = null
    this.unsubscribeUI = useUIStore.subscribe((state) => {
      if (state.selectedEntityId !== prevSelectedId || state.selectedEntityType !== prevSelectedType) {
        prevSelectedId = state.selectedEntityId
        prevSelectedType = state.selectedEntityType
        this.dirty = true
      }
    })
  }

  private coordKey(x: number, y: number): string {
    return `${x},${y}`
  }

  private worldToPixel(coord: WorldCoord): { x: number; y: number } {
    return {
      x: (coord.chunk_x * CHUNK_SIZE + coord.local_x) * TILE_SIZE,
      y: (coord.chunk_y * CHUNK_SIZE + coord.local_y) * TILE_SIZE,
    }
  }

  /**
   * Compute effective island pixel bounds — expanded to contain all districts
   * with padding. Mirrors TilemapManager.getEffectiveIslandBounds() so fog
   * covers the same area as the island landmass.
   */
  private getEffectiveIslandBounds(
    island: Island,
    districts: Map<string, District>,
  ): { x: number; y: number; w: number; h: number } {
    const pos = this.worldToPixel(island.position)
    let minX = pos.x
    let minY = pos.y
    let maxX = pos.x + island.bounds.width * TILE_SIZE
    let maxY = pos.y + island.bounds.height * TILE_SIZE

    // Expand to contain all districts on this island
    for (const district of districts.values()) {
      if (district.island_id !== island.id) continue
      const dp = this.worldToPixel(district.position)
      const dw = district.bounds.width * TILE_SIZE
      const dh = district.bounds.height * TILE_SIZE
      const wallPad = 20
      minX = Math.min(minX, dp.x - wallPad)
      minY = Math.min(minY, dp.y - wallPad)
      maxX = Math.max(maxX, dp.x + dw + wallPad)
      maxY = Math.max(maxY, dp.y + dh + wallPad + 20)
    }

    // Add island padding for coastline — match TilemapManager
    const pad = 40
    return {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    }
  }

  /** Optional interpolated pixel positions from AgentManager.
   *  When provided, fog reveal circles use these instead of store positions
   *  so they track agents smoothly during movement interpolation. */
  private agentPixelOverrides: Map<string, { x: number; y: number }> | null = null

  /** Set interpolated agent pixel positions (called by WorldRenderer each frame) */
  setAgentPositionOverrides(overrides: Map<string, { x: number; y: number }>): void {
    // Check if any position actually changed — avoid unnecessary re-renders
    if (this.agentPixelOverrides) {
      let changed = false
      for (const [id, pos] of overrides) {
        const prev = this.agentPixelOverrides.get(id)
        if (!prev || Math.abs(prev.x - pos.x) > 1 || Math.abs(prev.y - pos.y) > 1) {
          changed = true
          break
        }
      }
      if (!changed) return
    }
    this.agentPixelOverrides = overrides
    this.dirty = true
  }

  update(): void {
    if (!this.dirty) return
    this.dirty = false
    this.render()
  }

  private render(): void {
    const agents = useAgentStore.getState().agents
    const islands = useUniverseStore.getState().islands
    const districts = useUniverseStore.getState().districts
    const { selectedEntityId, selectedEntityType } = useUIStore.getState()

    // Track visited tiles (all agents contribute to exploration memory)
    for (const agent of agents.values()) {
      const cx = agent.position.chunk_x * CHUNK_SIZE + agent.position.local_x
      const cy = agent.position.chunk_y * CHUNK_SIZE + agent.position.local_y
      const r = agent.vision_radius

      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (dx * dx + dy * dy <= r * r) {
            this.visited.add(this.coordKey(cx + dx, cy + dy))
          }
        }
      }
    }

    // Clear previous frame — remove all children except the reveal mask
    const children = [...this.container.children]
    for (const child of children) {
      if (child !== this.revealMask) {
        this.container.removeChild(child)
      }
    }

    // Clear the reveal mask for this frame
    this.revealMask.clear()

    // -----------------------------------------------------------------------
    // Step 1: Draw island fog polygons as normal Graphics children.
    // These are the semi-transparent dark overlays on island landmasses.
    // -----------------------------------------------------------------------

    const buildings = useUniverseStore.getState().buildings

    for (const island of islands.values()) {
      const bounds = this.getEffectiveIslandBounds(island, districts)
      const icx = bounds.x + bounds.w / 2
      const icy = bounds.y + bounds.h / 2
      const seed = hashString(island.id)

      // Compute traits to match TilemapManager's coastline shape exactly
      let districtCount = 0
      let buildingCount = 0
      for (const district of districts.values()) {
        if (district.island_id !== island.id) continue
        districtCount++
      }
      for (const building of buildings.values()) {
        const district = districts.get(building.district_id)
        if (district && district.island_id === island.id) {
          buildingCount++
        }
      }
      const traits: IslandShapeTraits = {
        districtCount,
        buildingCount,
        agentCount: agents.size,
        biome: island.biome,
      }

      const g = new Graphics()
      const poly = generateCoastlinePolygon(icx, icy, bounds.w * 0.75, bounds.h * 0.75, seed, 64, 0.08, traits)
      drawPolygon(g, poly)
      g.fill({ color: 0x050510, alpha: 0.55 })
      this.container.addChild(g)
    }

    // -----------------------------------------------------------------------
    // Step 2: Draw reveal shapes into the mask Graphics. The inverse mask
    // hides the fog wherever these shapes are drawn, creating clean
    // transparent holes. No artifacts, no black areas.
    // -----------------------------------------------------------------------

    // Agent vision circles — only for agents that have appeared (are visible).
    // AgentManager.getAllAgentPositions() excludes agents with hasAppeared=false,
    // so we only draw circles for agents that are actively participating in replay.
    for (const agent of agents.values()) {
      // Skip agents that haven't appeared yet — AgentManager won't have
      // a position override for them, and we don't want fog circles at spawn.
      const override = this.agentPixelOverrides?.get(agent.id)
      if (!override) continue

      const isSelected =
        selectedEntityType === 'agent' && selectedEntityId === agent.id
      const isIdle = agent.status === 'idle'

      const px = override.x
      const py = override.y

      const baseRadius = agent.vision_radius * TILE_SIZE
      const radius = isSelected
        ? baseRadius * 0.75
        : isIdle
          ? baseRadius * 0.2
          : baseRadius * 0.4

      this.revealMask.circle(px, py, radius)
      this.revealMask.fill({ color: 0xffffff, alpha: 1 })
    }

    // Selected building reveal
    if (selectedEntityType === 'building' && selectedEntityId) {
      const buildings = useUniverseStore.getState().buildings
      const building = buildings.get(selectedEntityId)
      if (building) {
        const bPos = this.worldToPixel(building.position)
        const bw = building.footprint.width * TILE_SIZE
        const bh = building.footprint.height * TILE_SIZE
        const pad = 12
        this.revealMask.roundRect(bPos.x - pad, bPos.y - pad, bw + pad * 2, bh + pad * 2, 8)
        this.revealMask.fill({ color: 0xffffff, alpha: 1 })
      }
    }

    // Selected district reveal
    if (selectedEntityType === 'district' && selectedEntityId) {
      const district = districts.get(selectedEntityId)
      if (district) {
        const dPos = this.worldToPixel(district.position)
        const dw = district.bounds.width * TILE_SIZE
        const dh = district.bounds.height * TILE_SIZE
        const pad = 36
        const bottomExtra = 32
        this.revealMask.roundRect(dPos.x - pad, dPos.y - pad, dw + pad * 2, dh + pad + pad + bottomExtra, 10)
        this.revealMask.fill({ color: 0xffffff, alpha: 1 })
      }
    }
  }

  getFogState(worldX: number, worldY: number): FogState {
    const tileX = Math.floor(worldX / TILE_SIZE)
    const tileY = Math.floor(worldY / TILE_SIZE)

    const agents = useAgentStore.getState().agents
    for (const agent of agents.values()) {
      const ax = agent.position.chunk_x * CHUNK_SIZE + agent.position.local_x
      const ay = agent.position.chunk_y * CHUNK_SIZE + agent.position.local_y
      const dx = tileX - ax
      const dy = tileY - ay
      if (dx * dx + dy * dy <= agent.vision_radius * agent.vision_radius) {
        return 'visible'
      }
    }

    if (this.visited.has(this.coordKey(tileX, tileY))) {
      return 'fog'
    }

    return 'void'
  }

  markDirty(): void {
    this.dirty = true
  }

  destroy(): void {
    this.unsubscribeAgents?.()
    this.unsubscribeUI?.()
    // Clear the mask before destroying
    this.container.setMask({ mask: null })
    this.container.destroy({ children: true })
  }
}
