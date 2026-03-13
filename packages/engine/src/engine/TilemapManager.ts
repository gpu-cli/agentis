// ============================================================================
// Chunked Tilemap Manager — Renders islands, districts, buildings, tiles
//
// Visual hierarchy (bottom → top):
//   1. Water/void background — deep ocean with layered wave patterns
//   2. Island landmass — organic coastline, terrain fill, decorative elements
//   3. District zones — neighborhood ground fills with connecting roads/paths
//   4. Buildings — pixel-art structures with rooftops, shadows, details
//   5. File tiles (overlaid at street/interior zoom)
//   6. Labels
//
// The island coastline uses a seeded noise function to produce irregular,
// organic polygon shapes rather than geometric roundRects. Trees, rocks,
// flowers, and paths are scattered deterministically via hash-based placement.
// ============================================================================

import { Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js'
import type { Building, District, Island, Tile, WorldCoord } from '@multiverse/shared'
import { useUniverseStore } from '../stores/universeStore'
import { useAgentStore } from '../stores/agentStore'
import { useUIStore } from '../stores/uiStore'
import type { ZoomTier } from '../stores/uiStore'
import { AssetLoader } from './AssetLoader'
import { BIOME_COLORS, BIOME_WALL_TILES, CONNECTION_ROAD_STYLES } from './SpriteConfig'
import { spriteAtlas } from './SpriteAtlasRegistry'
import { composeBuilding } from './BuildingComposer'
import { AutotileEngine } from './AutotileEngine'
import { DistrictParceler } from './DistrictParceler'
import type { DistrictLayout } from './DistrictParceler'
import { resolveBiomeMaterials } from './biome-materials'
import {
  seededRandom,
  hashString,
  generateCoastlinePolygon,
  generateDistrictPolygon,
  drawPolygon,
  lighten,
  darken,
  type IslandShapeTraits,
} from './terrain'
// friendlyBuildingName removed — building file names only shown in sidebar panel

const TILE_SIZE = 32
const CHUNK_SIZE = 64

// ---------------------------------------------------------------------------
// District wall geometry constants
// ---------------------------------------------------------------------------

/** Inset from the outer district bounds to the wall perimeter */
const WALL_INSET = 6
/** Render size for each wall / ground tile */
const WALL_TILE_SIZE = 14
/** Additional inner inset for ground fill and ground tile tiling */
const GROUND_INSET = 4

/**
 * Compute the snapped wall rectangle for a district.
 *
 * The wall perimeter is auto-tiled at WALL_TILE_SIZE intervals. To prevent the
 * right/bottom walls from overshooting (leaving an untiled green strip inside),
 * we snap the width/height DOWN to the nearest multiple of WALL_TILE_SIZE.
 *
 * Every system that needs the "rendered district rectangle" — ground fill,
 * wall tiles, fog-of-war reveal, selection highlight, road connections — MUST
 * use this function so they all agree on the same geometry.
 */
function computeWallRect(
  pixelPos: { x: number; y: number },
  boundsW: number,
  boundsH: number,
): { x: number; y: number; w: number; h: number } {
  const rawW = boundsW - WALL_INSET * 2
  const rawH = boundsH - WALL_INSET * 2
  // Snap to tile grid — matches AutotileEngine.generateWallPerimeter which
  // uses floor(w / tileSize) * tileSize as the effective span.
  const cols = Math.max(1, Math.floor(rawW / WALL_TILE_SIZE))
  const rows = Math.max(1, Math.floor(rawH / WALL_TILE_SIZE))
  const snappedW = cols * WALL_TILE_SIZE
  const snappedH = rows * WALL_TILE_SIZE
  return {
    x: pixelPos.x + WALL_INSET,
    y: pixelPos.y + WALL_INSET,
    w: snappedW,
    h: snappedH,
  }
}

// ---------------------------------------------------------------------------
// Rect overlap utility — tests if a rect overlaps any rect in a list
// ---------------------------------------------------------------------------

/** Check whether rect `a` overlaps ANY rect in `obstacles`. */
function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  obstacles: { x: number; y: number; w: number; h: number }[],
): boolean {
  for (const b of obstacles) {
    if (a.x < b.x + b.w && a.x + a.w > b.x &&
        a.y < b.y + b.h && a.y + a.h > b.y) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Text styles
// ---------------------------------------------------------------------------

/** Create a planet label style scaled to the planet's ocean radius */
function makePlanetLabelStyle(oceanRadius: number): TextStyle {
  // Scale font: ~14px at radius 800, up to ~36px at radius 3000+
  const fontSize = Math.round(Math.max(14, Math.min(36, oceanRadius * 0.012)))
  return new TextStyle({
    fontFamily: '"Press Start 2P", monospace',
    fontSize,
    fill: 0x88ccff,
    dropShadow: { color: 0x000000, distance: 2, blur: 3 },
  })
}

/** Create an island label style — matches district label sizing */
function makeIslandLabelStyle(_islandPixelSize: number): TextStyle {
  return new TextStyle({
    fontFamily: '"Press Start 2P", monospace',
    fontSize: 7,
    fill: 0xffffff,
    dropShadow: { color: 0x000000, distance: 1, blur: 1 },
  })
}

const districtLabelStyle = new TextStyle({
  fontFamily: '"Press Start 2P", monospace',
  fontSize: 7,
  fill: 0xffffff,
  dropShadow: { color: 0x000000, distance: 1, blur: 1 },
})

const badgeStyle = new TextStyle({
  fontFamily: '"Press Start 2P", monospace',
  fontSize: 6,
  fill: 0xffd700,
})

const fileLabelStyle = new TextStyle({
  fontFamily: '"Press Start 2P", monospace',
  fontSize: 5,
  fill: 0xcccccc,
})

// ---------------------------------------------------------------------------
// Biome-specific ground colors (richer than the single BIOME_COLORS)
// ---------------------------------------------------------------------------

const GROUND_COLORS: Record<string, { base: number; grass: number; accent: number }> = {
  urban:       { base: 0x2d5a4e, grass: 0x4a8a65, accent: 0x6aaf80 },
  library:     { base: 0x6a5a30, grass: 0x8a7a48, accent: 0xa89a58 },
  industrial:  { base: 0x5a4a30, grass: 0x7a6a48, accent: 0x8a7a58 },
  observatory: { base: 0x2a3a5a, grass: 0x3a5a7a, accent: 0x4a6a8a },
  arts:        { base: 0x5a3a6a, grass: 0x7a5a8a, accent: 0x9a7aaa },
  harbor:      { base: 0x305a5a, grass: 0x4a7a7a, accent: 0x5a9090 },
  civic:       { base: 0x306a40, grass: 0x4a9a5a, accent: 0x6aba75 },
}

// ---------------------------------------------------------------------------
// Selection highlight — universal high-contrast colors
// Bright white border + soft cyan fill works against ALL biome wall colors.
// ---------------------------------------------------------------------------

const SELECTION_HIGHLIGHT = {
  glow: 0x67e8f9,    // cyan-300 — outer glow
  border: 0xffffff,  // white — crisp inner border (max contrast on any bg)
  fill: 0xa5f3fc,    // cyan-200 — subtle interior tint
} as const

// ============================================================================

export class TilemapManager {
  /** Ground layers: water, islands, decorations, districts, roads.
   *  Added to the viewport at a LOW zIndex so buildings/agents render on top. */
  container: Container

  /** Buildings layer — mounted by WorldRenderer at a HIGHER viewport zIndex
   *  than `container` so buildings are never obscured by island/district elements. */
  buildingContainer: Container

  /** Labels layer — mounted by WorldRenderer at the HIGHEST viewport zIndex
   *  (below fog) so labels float above everything. */
  labelContainer: Container

  /** District hit areas — separate viewport-level container so district clicks
   *  are tested at a higher priority than ground visuals. Mounted between
   *  ground (zIndex 0) and buildings (zIndex 5). */
  districtHitContainer: Container

  private waterLayer: Container
  private islandLayer: Container
  private decorLayer: Container   // trees, rocks, flowers — between island and districts
  private districtLayer: Container
  private roadLayer: Container    // roads/paths between districts
  tileLayer: Container

  /** Selection highlight layer — sits above fog so always visible.
   *  Updated independently of the full tilemap re-render. */
  selectionHighlightContainer: Container

  private currentZoomTier: ZoomTier = 'district'
  private currentHoveredId: string | null = null
  private unsubscribeUniverse: (() => void) | null = null
  private unsubscribeUI: (() => void) | null = null

  // V4: Split dirty flags for incremental rendering
  private structureDirty = true   // water/islands/districts/roads need full rebuild
  private buildingsDirty = true   // buildings need reconciliation via map
  private hoverDirty = false      // hover badge needs lightweight update
  private cacheDirty = true       // V4: ground caches need regeneration

  // V4: Building container retention — avoid full redraws for stats changes
  private buildingMap = new Map<string, { container: Container; health: number; fileCount: number }>()
  private hoverBadgeObjects: { bg: Graphics; text: Text } | null = null

  // V4.5: Backpressure — throttle building container rebuilds to ≤ 10 Hz
  private static readonly BUILDING_FLUSH_INTERVAL_MS = 100 // 10 Hz cap
  private pendingBuildingUpdates = new Map<string, { fileCount: number; health: number }>()
  private lastBuildingFlush = 0

  // Cache coastline polygons so they don't regenerate every frame
  private coastlineCache = new Map<string, { x: number; y: number }[]>()

  // Cache effective island pixel bounds (expanded to contain all districts)
  private islandBoundsCache = new Map<string, { x: number; y: number; w: number; h: number }>()

  // Cache district polygons for click detection and selection highlight
  private districtPolyCache = new Map<string, { x: number; y: number }[]>()

  // Cache district wall rects for selection highlights (the actual walled-town shape)
  private districtRectCache = new Map<string, { x: number; y: number; w: number; h: number }>()

  // Cache district layouts from DistrictParceler (roads, parcels, decorations)
  private districtLayoutCache = new Map<string, DistrictLayout>()

  // Pulse animation state for selection glow
  private selectionPulsePhase = 0

  // Building tint flash state: buildingId → { color, startTime, duration }
  private buildingTints = new Map<string, { color: number; startTime: number; duration: number }>()

  constructor() {
    // --- Ground container (water, islands, decorations, districts, roads) ---
    this.container = new Container()
    this.container.label = 'tilemap-ground'
    this.container.sortableChildren = true

    this.waterLayer = new Container()
    this.waterLayer.label = 'water'
    this.waterLayer.zIndex = 0
    this.islandLayer = new Container()
    this.islandLayer.label = 'islands'
    this.islandLayer.zIndex = 1
    this.decorLayer = new Container()
    this.decorLayer.label = 'decorations'
    this.decorLayer.zIndex = 2
    this.decorLayer.eventMode = 'none'
    this.decorLayer.interactiveChildren = false
    this.districtLayer = new Container()
    this.districtLayer.label = 'districts'
    this.districtLayer.zIndex = 3
    this.roadLayer = new Container()
    this.roadLayer.label = 'roads'
    // Draw roads beneath district walls/ground so wall sprites remain on top
    // at gates, but above general decorations.
    this.roadLayer.zIndex = 2.9
    this.roadLayer.eventMode = 'none'
    this.roadLayer.interactiveChildren = false

    this.container.addChild(
      this.waterLayer,
      this.islandLayer,
      this.decorLayer,
      this.districtLayer,
      this.roadLayer,
    )

    // --- Buildings container (separate viewport-level container) ---
    this.buildingContainer = new Container()
    this.buildingContainer.label = 'buildings'
    this.buildingContainer.sortableChildren = true

    this.tileLayer = new Container()
    this.tileLayer.label = 'tiles'

    // --- Selection highlight container (above buildings, below labels) ---
    this.selectionHighlightContainer = new Container()
    this.selectionHighlightContainer.label = 'selection-highlight'
    this.selectionHighlightContainer.eventMode = 'none'
    this.selectionHighlightContainer.interactiveChildren = false

    // --- District hit container (separate viewport-level container) ---
    // Mounted between ground (zIndex 0) and buildings (zIndex 5) so district
    // click areas are tested at a higher priority than ground visuals.
    this.districtHitContainer = new Container()
    this.districtHitContainer.label = 'district-hits'
    this.districtHitContainer.sortableChildren = false

    // --- Labels container (separate viewport-level container) ---
    // CRITICAL: Labels must not intercept pointer events — clicks need to
    // pass through to districts and buildings underneath.
    this.labelContainer = new Container()
    this.labelContainer.label = 'labels'
    this.labelContainer.eventMode = 'none'
    this.labelContainer.interactiveChildren = false

    // V4: Smart subscription — only trigger full rebuild for structural changes.
    // Building/tile changes are handled via diff-driven updates or lightweight reconciliation.
    this.unsubscribeUniverse = useUniverseStore.subscribe((state, prevState) => {
      if (state.islands !== prevState.islands ||
          state.districts !== prevState.districts ||
          state.connections !== prevState.connections ||
          state.planetName !== prevState.planetName) {
        // Structural change — full layer rebuild needed
        this.structureDirty = true
        this.buildingsDirty = true
        this.cacheDirty = true
        this.coastlineCache.clear()
        this.islandBoundsCache.clear()
        this.districtLayoutCache.clear()
      } else if (state.buildings !== prevState.buildings || state.tiles !== prevState.tiles) {
        // Building/tile data changed — reconcile buildings only
        this.buildingsDirty = true
      }
    })
    this.unsubscribeUI = useUIStore.subscribe((state) => {
      if (state.zoomTier !== this.currentZoomTier) {
        this.currentZoomTier = state.zoomTier
        // Zoom tier changes should not trigger structural rebuilds, which can
        // cause non-deterministic building re-composition. Keep containers and
        // only update zoom-dependent visibility/reconciliation.
        this.updateBuildingVisibility()
        this.buildingsDirty = true
      }
      // Hover change — lightweight badge update only
      if (state.hoveredEntityId !== this.currentHoveredId) {
        this.currentHoveredId = state.hoveredEntityId
        this.hoverDirty = true
      }
    })
  }

  // ---------------------------------------------------------------------------
  // V4: RenderTexture caching for ground layers
  // ---------------------------------------------------------------------------

  /** Regenerate cached sprites for ground (water+islands+decor) and overlay (districts+roads).
   *
   * NOTE: RenderTexture-based caching is DISABLED because addChild() re-parents
   * the layer containers into a temporary group, which detaches them from the
   * main container and causes the ground layers to disappear. The live layers
   * remain visible instead — performance impact is negligible for PoC scale. */
  private regenerateGroundCaches(): void {
    // Keep all ground layers visible — no caching
    this.waterLayer.visible = true
    this.islandLayer.visible = true
    this.decorLayer.visible = true
    this.districtLayer.visible = true
    this.roadLayer.visible = true
    this.cacheDirty = false
  }

  private worldToPixel(coord: WorldCoord): { x: number; y: number } {
    return {
      x: (coord.chunk_x * CHUNK_SIZE + coord.local_x) * TILE_SIZE,
      y: (coord.chunk_y * CHUNK_SIZE + coord.local_y) * TILE_SIZE,
    }
  }

  /**
   * Compute effective island pixel bounds — expanded to contain all districts
   * with padding. This ensures districts never overflow the island landmass.
   */
  private getEffectiveIslandBounds(island: Island): { x: number; y: number; w: number; h: number } {
    let cached = this.islandBoundsCache.get(island.id)
    if (cached) return cached

    const pos = this.worldToPixel(island.position)
    let minX = pos.x
    let minY = pos.y
    let maxX = pos.x + island.bounds.width * TILE_SIZE
    let maxY = pos.y + island.bounds.height * TILE_SIZE

    // Expand to contain all districts on this island
    const store = useUniverseStore.getState()
    for (const district of store.districts.values()) {
      if (district.island_id !== island.id) continue
      const dp = this.worldToPixel(district.position)
      const dw = district.bounds.width * TILE_SIZE
      const dh = district.bounds.height * TILE_SIZE
      // Include wall tile overhang (14px)
      const wallPad = 20
      minX = Math.min(minX, dp.x - wallPad)
      minY = Math.min(minY, dp.y - wallPad)
      maxX = Math.max(maxX, dp.x + dw + wallPad)
      maxY = Math.max(maxY, dp.y + dh + wallPad + 20) // extra for name banner below
    }

    // Add island padding for coastline — generous to prevent overflow
    const pad = 40
    cached = {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    }
    this.islandBoundsCache.set(island.id, cached)
    return cached
  }

  update(): void {
    // Advance selection pulse animation every frame
    this.selectionPulsePhase += 0.04
    const ui = useUIStore.getState()
    if (ui.selectedEntityId && (ui.selectedEntityType === 'building' || ui.selectedEntityType === 'district')) {
      this.updateSelectionHighlight(ui.selectedEntityId, ui.selectedEntityType)
    }

    // Update building tint flashes (lerp back to white)
    this.updateBuildingTints()

    // V4.5: Flush throttled building stats at ≤ 10 Hz
    this.flushPendingBuildingUpdates()

    // V4: Prioritized dirty handling — structure > buildings > hover
    if (this.structureDirty) {
      this.structureDirty = false
      this.buildingsDirty = false
      this.hoverDirty = false
      this.pendingBuildingUpdates.clear() // structural render rebuilds all buildings
      this.render()
      return
    }
    if (this.buildingsDirty) {
      this.buildingsDirty = false
      this.hoverDirty = false
      this.reconcileBuildings()
    }
    if (this.hoverDirty) {
      this.hoverDirty = false
      this.updateHoverBadge()
    }
  }

  private render(): void {
    const store = useUniverseStore.getState()
    const tier = this.currentZoomTier

    // Clear static layers (NOT buildingContainer — that's managed by buildingMap)
    // Ensure ground layers are visible during re-render before caching
    this.waterLayer.visible = true
    this.islandLayer.visible = true
    this.decorLayer.visible = true
    this.districtLayer.visible = true
    this.roadLayer.visible = true
    this.waterLayer.removeChildren()
    this.islandLayer.removeChildren()
    this.decorLayer.removeChildren()
    this.districtLayer.removeChildren()
    this.districtHitContainer.removeChildren()
    this.roadLayer.removeChildren()
    this.tileLayer.removeChildren()
    this.labelContainer.removeChildren()
    // Clear hover badge tracking since labelContainer was cleared
    this.hoverBadgeObjects = null

    // Always render water + islands + planet label
    this.renderWater(store.islands)
    this.renderIslands(store.islands)
    this.renderPlanetLabel(store.islands)

    if (tier === 'universe' || tier === 'orbital') {
      // Just islands — no detail. Add subtle glow for "planet" feel
      this.renderPlanetGlow(store.islands)
    } else if (tier === 'island' || tier === 'district') {
      // Decorations disabled — plain green background for now
      this.renderDistricts(store.districts, store.islands)
      this.renderRoads(store.districts, store.islands)
    } else {
      // street or interior — decorations disabled for plain background
      this.renderDistricts(store.districts, store.islands)
      this.renderRoads(store.districts, store.islands)
    }

    // After ground layers are drawn, regenerate caches if needed
    if (this.cacheDirty) {
      this.regenerateGroundCaches()
    }

    // V4: Reconcile buildings via retained map (avoids full recreation)
    this.reconcileBuildings()
    this.updateHoverBadge()
  }

  /** Toggle zoom-tier visibility without rebuilding building containers. */
  private updateBuildingVisibility(): void {
    const tier = this.currentZoomTier
    const showBuildings = tier !== 'universe' && tier !== 'orbital'
    this.buildingContainer.visible = showBuildings
    this.tileLayer.visible = tier === 'street' || tier === 'interior'
    if (!this.tileLayer.visible) {
      this.tileLayer.removeChildren()
    }
  }

  // =========================================================================
  // Planet name label — centered above all islands
  // =========================================================================

  private renderPlanetLabel(islands: Map<string, Island>): void {
    const planetName = useUniverseStore.getState().planetName
    if (!planetName || islands.size === 0) return

    // Compute planet center (same logic as renderWater)
    let pcx = 0, pcy = 0, count = 0
    for (const island of islands.values()) {
      const bounds = this.getEffectiveIslandBounds(island)
      pcx += bounds.x + bounds.w / 2
      pcy += bounds.y + bounds.h / 2
      count++
    }
    if (count === 0) return
    pcx /= count
    pcy /= count

    // Find ocean radius (same as renderWater) to get the planet's visual top edge
    let maxDist = 0
    for (const island of islands.values()) {
      const bounds = this.getEffectiveIslandBounds(island)
      const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.w, y: bounds.y },
        { x: bounds.x, y: bounds.y + bounds.h },
        { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      ]
      for (const c of corners) {
        const d = Math.sqrt((c.x - pcx) ** 2 + (c.y - pcy) ** 2)
        maxDist = Math.max(maxDist, d)
      }
    }
    const oceanRadius = maxDist + 800

    // Place label at the top of the planet circle, just inside the ocean edge
    const style = makePlanetLabelStyle(oceanRadius)
    const label = new Text({ text: planetName, style })
    const labelW = label.width
    const labelH = label.height
    const labelX = pcx - labelW / 2
    const labelY = pcy - oceanRadius + 40

    // Background pill
    const pill = new Graphics()
    const padH = Math.round(labelH * 0.5)
    const padW = Math.round(labelW * 0.12) + 14
    pill.roundRect(labelX - padW, labelY - padH / 2, labelW + padW * 2, labelH + padH, 10)
    pill.fill({ color: 0x0a1628, alpha: 0.7 })
    pill.stroke({ color: 0x88ccff, alpha: 0.3, width: 1 })
    this.labelContainer.addChild(pill)

    label.x = labelX
    label.y = labelY
    this.labelContainer.addChild(label)
  }

  // =========================================================================
  // Get or generate cached coastline polygon for an island
  // =========================================================================

  private getCoastline(island: Island): { x: number; y: number }[] {
    let poly = this.coastlineCache.get(island.id)
    if (poly) return poly

    // Use effective bounds (expanded to contain all districts)
    const bounds = this.getEffectiveIslandBounds(island)
    const cx = bounds.x + bounds.w / 2
    const cy = bounds.y + bounds.h / 2
    const seed = hashString(island.id)

    // Compute traits from transcript data for interesting shape generation
    const store = useUniverseStore.getState()
    let districtCount = 0
    let buildingCount = 0
    for (const district of store.districts.values()) {
      if (district.island_id !== island.id) continue
      districtCount++
    }
    for (const building of store.buildings.values()) {
      const district = store.districts.get(building.district_id)
      if (district && district.island_id === island.id) {
        buildingCount++
      }
    }
    const agents = useAgentStore.getState().agents
    const agentCount = agents.size

    const traits: IslandShapeTraits = {
      districtCount,
      buildingCount,
      agentCount,
      biome: island.biome,
    }

    // Use 0.75x multiplier to ensure the polygon covers ALL corners
    // of the bounding rect. Math: corner is inside ellipse when M >= 1/sqrt(2) ≈ 0.707.
    // We use 0.75 to provide margin for harmonic + noise displacement.
    poly = generateCoastlinePolygon(cx, cy, bounds.w * 0.75, bounds.h * 0.75, seed, 64, 0.08, traits)
    this.coastlineCache.set(island.id, poly)
    return poly
  }

  // =========================================================================
  // Layer 0: Planet glow (universe/orbital zoom only)
  // =========================================================================

  private renderPlanetGlow(islands: Map<string, Island>): void {
    // Compute center of all islands
    let cx = 0, cy = 0, count = 0
    let maxDist = 0
    const centers: { x: number; y: number }[] = []

    for (const island of islands.values()) {
      const bounds = this.getEffectiveIslandBounds(island)
      const icx = bounds.x + bounds.w / 2
      const icy = bounds.y + bounds.h / 2
      centers.push({ x: icx, y: icy })
      cx += icx
      cy += icy
      count++
    }
    if (count === 0) return
    cx /= count
    cy /= count

    // Find max distance from center to any island edge
    for (const island of islands.values()) {
      const bounds = this.getEffectiveIslandBounds(island)
      const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.w, y: bounds.y },
        { x: bounds.x, y: bounds.y + bounds.h },
        { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      ]
      for (const c of corners) {
        const d = Math.sqrt((c.x - cx) ** 2 + (c.y - cy) ** 2)
        maxDist = Math.max(maxDist, d)
      }
    }

    const radius = maxDist + 500

    // Atmospheric glow rings (simulating a planet atmosphere)
    const glowColors = [
      { r: radius + 100, color: 0x1a3a6a, alpha: 0.04 },
      { r: radius + 60, color: 0x2a5a8a, alpha: 0.06 },
      { r: radius + 30, color: 0x3a7aaa, alpha: 0.05 },
    ]

    for (const ring of glowColors) {
      const glow = new Graphics()
      glow.circle(cx, cy, ring.r)
      glow.fill({ color: ring.color, alpha: ring.alpha })
      this.islandLayer.addChild(glow)
    }
  }

  // =========================================================================
  // Layer 1: Water / Ocean
  // =========================================================================

  private renderWater(islands: Map<string, Island>): void {
    // --- Compute planet center and radius (circular ocean) ---
    let cx = 0, cy = 0, count = 0
    for (const island of islands.values()) {
      const bounds = this.getEffectiveIslandBounds(island)
      cx += bounds.x + bounds.w / 2
      cy += bounds.y + bounds.h / 2
      count++
    }
    if (count === 0) return
    cx /= count
    cy /= count

    // Find max distance from center to any island edge
    let maxDist = 0
    for (const island of islands.values()) {
      const bounds = this.getEffectiveIslandBounds(island)
      const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.w, y: bounds.y },
        { x: bounds.x, y: bounds.y + bounds.h },
        { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      ]
      for (const c of corners) {
        const d = Math.sqrt((c.x - cx) ** 2 + (c.y - cy) ** 2)
        maxDist = Math.max(maxDist, d)
      }
    }

    const radius = maxDist + 800

    // --- Feathered edge (outer glow rings for smooth ocean-to-void transition) ---
    const edgeRings = [
      { r: radius + 80, alpha: 0.03 },
      { r: radius + 50, alpha: 0.06 },
      { r: radius + 25, alpha: 0.10 },
      { r: radius + 10, alpha: 0.15 },
    ]
    for (const ring of edgeRings) {
      const edgeG = new Graphics()
      edgeG.circle(cx, cy, ring.r)
      edgeG.fill({ color: 0x0a1628, alpha: ring.alpha })
      this.waterLayer.addChild(edgeG)
    }

    // --- Deep ocean base (circular) ---
    const ocean = new Graphics()
    ocean.circle(cx, cy, radius)
    ocean.fill({ color: 0x0a1628, alpha: 1 })
    this.waterLayer.addChild(ocean)

    const rSq = radius * radius
    const iterMinX = cx - radius
    const iterMinY = cy - radius
    const iterSize = radius * 2

    // --- Wave ripple pattern (clipped to circle) ---
    const waves = new Graphics()
    const waveSpacing = 60
    for (let y = iterMinY; y < iterMinY + iterSize; y += waveSpacing) {
      const rowSeed = seededRandom(Math.floor(y * 0.1) + 999)
      const offset = rowSeed * 40
      let started = false
      for (let x = iterMinX; x <= iterMinX + iterSize; x += 20) {
        // Only draw within circular boundary (with slight inset to avoid edge artifacts)
        const dx = x - cx, dy = (y + offset) - cy
        if (dx * dx + dy * dy > rSq * 0.95) {
          started = false
          continue
        }
        const wobble = Math.sin((x + y * 0.3) * 0.02) * 8 + Math.sin(x * 0.05) * 4
        if (!started) {
          waves.moveTo(x, y + offset + wobble)
          started = true
        } else {
          waves.lineTo(x, y + offset + wobble)
        }
      }
      if (started) {
        waves.stroke({ color: 0x142e4a, alpha: 0.25, width: 1 })
      }
    }
    this.waterLayer.addChild(waves)

    // --- Foam / highlights near island coastlines ---
    for (const island of islands.values()) {
      const poly = this.getCoastline(island)
      this.renderCoastlineFoam(poly)
    }
  }

  /** Render foam/surf rings just outside the coastline */
  private renderCoastlineFoam(poly: { x: number; y: number }[]): void {
    if (poly.length < 3) return

    // Compute centroid
    let cx = 0, cy = 0
    for (const p of poly) { cx += p.x; cy += p.y }
    cx /= poly.length
    cy /= poly.length

    // Outer foam ring — expanded polygon
    for (const expansion of [1.06, 1.10, 1.15]) {
      const foam = new Graphics()
      const expanded = poly.map(p => ({
        x: cx + (p.x - cx) * expansion,
        y: cy + (p.y - cy) * expansion,
      }))
      drawPolygon(foam, expanded)
      const alpha = expansion === 1.06 ? 0.15 : expansion === 1.10 ? 0.08 : 0.04
      foam.stroke({
        color: 0x4a8aaa,
        alpha,
        width: expansion === 1.06 ? 3 : 2,
      })
      this.waterLayer.addChild(foam)
    }

    // Shallow water ring — filled between coastline and first expansion
    const shallow = new Graphics()
    const expandedOuter = poly.map(p => ({
      x: cx + (p.x - cx) * 1.08,
      y: cy + (p.y - cy) * 1.08,
    }))
    drawPolygon(shallow, expandedOuter)
    shallow.fill({ color: 0x1a4a6a, alpha: 0.2 })
    this.waterLayer.addChild(shallow)
  }

  // =========================================================================
  // Layer 2: Island landmass (organic coastline + terrain fill)
  // =========================================================================

  private renderIslands(islands: Map<string, Island>): void {
    for (const island of islands.values()) {
      const biomeColor = BIOME_COLORS[island.biome] ?? 0x2c3e50
      const groundColors = GROUND_COLORS[island.biome] ?? GROUND_COLORS.urban!
      const bounds = this.getEffectiveIslandBounds(island)
      const w = bounds.w
      const h = bounds.h
      const poly = this.getCoastline(island)

      // --- Beach/sand ring (slightly expanded polygon) ---
      const cx = bounds.x + w / 2
      const cy = bounds.y + h / 2
      const beachPoly = poly.map(p => ({
        x: cx + (p.x - cx) * 1.03,
        y: cy + (p.y - cy) * 1.03,
      }))
      const beach = new Graphics()
      drawPolygon(beach, beachPoly)
      beach.fill({ color: 0xc2a868, alpha: 0.35 })
      this.islandLayer.addChild(beach)

      // --- Main landmass fill (solid green, no texture dots) ---
      const land = new Graphics()
      drawPolygon(land, poly)
      land.fill({ color: groundColors.base, alpha: 1.0 })
      this.islandLayer.addChild(land)

      // --- Solid green ground (no dot pattern overlay) ---
      // The main landmass fill above provides a clean solid green background.

      // --- Coastline border (organic stroke following polygon) ---
      const coastline = new Graphics()
      drawPolygon(coastline, poly)
      coastline.stroke({ color: lighten(biomeColor, 0.25), alpha: 0.7, width: 3 })
      this.islandLayer.addChild(coastline)

      // Thinner inner contour line
      const innerContour = new Graphics()
      const innerPoly = poly.map(p => ({
        x: cx + (p.x - cx) * 0.97,
        y: cy + (p.y - cy) * 0.97,
      }))
      drawPolygon(innerContour, innerPoly)
      innerContour.stroke({ color: lighten(groundColors.grass, 0.1), alpha: 0.2, width: 1 })
      this.islandLayer.addChild(innerContour)

      // --- Island label (just inside the top of the polygon) ---
      const islandPixelSize = Math.max(w, h) * TILE_SIZE
      const ilStyle = makeIslandLabelStyle(islandPixelSize)
      const label = new Text({ text: island.name, style: ilStyle })
      const labelW = label.width
      const labelH = label.height
      // Place label well inside the island — 50% from top toward center
      let topY = Infinity
      for (const p of poly) topY = Math.min(topY, p.y)
      const labelX = cx - labelW / 2
      const labelY = topY + (cy - topY) * 0.5

      const pill = new Graphics()
      const ilPadH = Math.round(labelH * 0.4)
      const ilPadW = Math.round(labelW * 0.08) + 10
      pill.roundRect(labelX - ilPadW, labelY - ilPadH / 2, labelW + ilPadW * 2, labelH + ilPadH, 8)
      pill.fill({ color: 0x0a1628, alpha: 1 })
      pill.stroke({ color: lighten(biomeColor, 0.3), alpha: 0.7, width: 1.5 })
      this.labelContainer.addChild(pill)

      label.x = labelX
      label.y = labelY
      this.labelContainer.addChild(label)
    }
  }

  // Decorations (trees, rocks, flowers) removed — plain green background for now

  // =========================================================================
  // District layout computation — cached per district
  // =========================================================================

  /**
   * Get or compute the DistrictLayout for a district.
   * Uses DistrictParceler to generate internal road grids, building parcels,
   * and decoration zones. Results are cached and recomputed only on structural changes.
   */
  private getDistrictLayout(
    district: District,
    wallRect: { x: number; y: number; w: number; h: number },
  ): DistrictLayout {
    let cached = this.districtLayoutCache.get(district.id)
    if (cached) return cached

    const store = useUniverseStore.getState()
    const seed = hashString(district.id)

    // Collect buildings in this district with their footprints
    const buildings: { id: string; width: number; height: number }[] = []
    for (const bld of store.buildings.values()) {
      if (bld.district_id !== district.id) continue
      buildings.push({
        id: bld.id,
        width: bld.footprint.width,
        height: bld.footprint.height,
      })
    }

    // Plan the district layout (roads, parcels, decorations)
    cached = DistrictParceler.plan(district.id, wallRect, buildings, seed)
    this.districtLayoutCache.set(district.id, cached)
    return cached
  }

  // =========================================================================
  // Layer 3: Districts — Walled towns / kingdoms
  //
  // Each district renders as an enclosed town with:
  //   - Filled ground interior (biome-tinted)
  //   - Tiled wall perimeter using Kenney wall/castle tiles
  //   - Corner tower accents
  //   - Gate openings on sides facing connected districts
  //   - Ground detail dots inside the walls
  //   - Name banner at top
  //   - % complete badge (hover only)
  // =========================================================================

  private renderDistricts(
    districts: Map<string, District>,
    islands: Map<string, Island>,
  ): void {
    // Clear district caches for fresh generation
    this.districtPolyCache.clear()
    this.districtRectCache.clear()

    const store = useUniverseStore.getState()
    const assets = AssetLoader.instance

    for (const district of districts.values()) {
      const pos = this.worldToPixel(district.position)
      const w = district.bounds.width * TILE_SIZE
      const h = district.bounds.height * TILE_SIZE
      const cx = pos.x + w / 2
      const cy = pos.y + h / 2

      const island = islands.get(district.island_id)
      const biomeKey = district.biome_override ?? island?.biome ?? 'urban'
      const biomeColor = BIOME_COLORS[biomeKey] ?? 0x3498db
      const groundColors = GROUND_COLORS[biomeKey] ?? GROUND_COLORS.urban!
      const seed = hashString(district.id)

      // Compute the snapped wall rect — shared geometry for walls, ground,
      // fog reveal, selection highlight, and road connections.
      const wallRect = computeWallRect(pos, w, h)

      // Cache wall rect for selection highlights and fog reveal
      this.districtRectCache.set(district.id, wallRect)

      // Also keep the organic polygon for backward compatibility
      const distPoly = generateDistrictPolygon(cx, cy, w * 0.48, h * 0.48, seed)
      this.districtPolyCache.set(district.id, distPoly)

      // ── Ground fill (interior of the town) — biome-specific tiled sprites ──
      // First draw a base color fill as fallback / blending layer
      const groundFill = new Graphics()
      groundFill.roundRect(wallRect.x + 2, wallRect.y + 2, wallRect.w - 4, wallRect.h - 4, 4)
      groundFill.fill({ color: groundColors.base, alpha: 0.35 })
      this.districtLayer.addChild(groundFill)

      // NOTE: Do NOT skip ground tiles under buildings. Buildings render at a
      // higher zIndex (5) than districts (3), so they naturally occlude ground.
      // Previously we carved holes for buildings using isOnBuilding(), but during
      // replay building footprints change dynamically as files arrive, creating
      // visible gaps in the ground where the initial footprint was carved.

      // Tile the interior with biome-specific ground sprites (full coverage)
      const groundTileTypes = assets.getBiomeTileTypes(biomeKey)
      if (groundTileTypes.length > 0) {
        const innerX = wallRect.x + GROUND_INSET
        const innerY = wallRect.y + GROUND_INSET
        const innerW = wallRect.w - GROUND_INSET * 2
        const innerH = wallRect.h - GROUND_INSET * 2
        for (let gx = 0; gx < innerW; gx += WALL_TILE_SIZE) {
          for (let gy = 0; gy < innerH; gy += WALL_TILE_SIZE) {
            const px = innerX + gx
            const py = innerY + gy

            // Pick tile type deterministically based on position
            const s = seededRandom(seed + gx * 41 + gy * 67)
            const tileTypeIndex = Math.floor(s * groundTileTypes.length) % groundTileTypes.length
            const tileType = groundTileTypes[tileTypeIndex]!
            const tex = assets.getBiomeTileTexture(biomeKey, tileType)

            const groundSprite = new Sprite(tex)
            groundSprite.x = px
            groundSprite.y = py
            groundSprite.width = WALL_TILE_SIZE
            groundSprite.height = WALL_TILE_SIZE
            groundSprite.alpha = 0.45 + s * 0.2 // slight alpha variation
            this.districtLayer.addChild(groundSprite)
          }
        }
      }

      // Ground detail dots — sparse accents between ground tiles
      const detail = new Graphics()
      const detailSpacing = 22
      for (let dx = WALL_INSET + 6; dx < w - WALL_INSET - 6; dx += detailSpacing) {
        for (let dy = WALL_INSET + 6; dy < h - WALL_INSET - 6; dy += detailSpacing) {
          const px = pos.x + dx
          const py = pos.y + dy

          const s = seededRandom(seed + dx * 41 + dy * 67 + 999)
          if (s > 0.7) {
            const jx = (s - 0.5) * 6
            const jy = (seededRandom(seed + dx + 999) - 0.5) * 6
            detail.circle(px + jx, py + jy, 1 + s * 0.8)
            detail.fill({ color: lighten(groundColors.grass, 0.12), alpha: 0.25 })
          }
        }
      }
      this.districtLayer.addChild(detail)

      // ── Wall perimeter using autotiled sprites ──
      const wx = wallRect.x, wy = wallRect.y
      const ww = wallRect.w, wh = wallRect.h

      // Shadow under the walls
      const wallShadow = new Graphics()
      wallShadow.roundRect(wx + 3, wy + 3, ww, wh, 3)
      wallShadow.fill({ color: 0x000000, alpha: 0.2 })
      this.districtLayer.addChild(wallShadow)

      // Resolve wall material from biome
      const biomeMats = resolveBiomeMaterials(biomeKey)

      // Compute district layout (roads, parcels, decorations, gates)
      const districtLayout = this.getDistrictLayout(district, wallRect)

      // Convert gate positions to road intersections for wall autotiling
      const roadIntersections = districtLayout.gates.map(g => ({
        x: g.x,
        y: g.y,
        direction: (g.direction === 'n' || g.direction === 's' ? 'v' : 'h') as 'h' | 'v',
      }))

      if (spriteAtlas.isReady) {
        // V2: Autotiled wall perimeter with gate positions
        const autotiledWalls = AutotileEngine.generateDistrictWalls(
          { x: wx, y: wy, w: ww, h: wh },
          WALL_TILE_SIZE,
          roadIntersections,
          biomeMats.wall,
        )

        for (const wt of autotiledWalls) {
          // Map abstract role to Kenney atlas role
          const atlasRole = AutotileEngine.wallRoleToAtlasRole(wt.role)
          const wallTex = spriteAtlas.resolve('building', biomeMats.wall, atlasRole)
          const tile = new Sprite(wallTex)
          tile.x = wt.x
          tile.y = wt.y
          tile.width = WALL_TILE_SIZE
          tile.height = WALL_TILE_SIZE
          tile.alpha = 0.85
          this.districtLayer.addChild(tile)
        }
      } else {
        // Legacy fallback: uniform wall tiles
        const wallTiles = BIOME_WALL_TILES[biomeKey] ?? BIOME_WALL_TILES.urban!

        // Top wall
        const topWallCount = Math.max(1, Math.floor(ww / WALL_TILE_SIZE))
        for (let i = 0; i < topWallCount; i++) {
          const tile = new Sprite(assets.getAnyTileTexture(wallTiles.h))
          tile.x = wx + i * (ww / topWallCount)
          tile.y = wy - WALL_TILE_SIZE / 2
          tile.width = ww / topWallCount + 1
          tile.height = WALL_TILE_SIZE
          tile.alpha = 0.8
          this.districtLayer.addChild(tile)
        }

        // Bottom wall
        for (let i = 0; i < topWallCount; i++) {
          const tile = new Sprite(assets.getAnyTileTexture(wallTiles.h))
          tile.x = wx + i * (ww / topWallCount)
          tile.y = wy + wh - WALL_TILE_SIZE / 2
          tile.width = ww / topWallCount + 1
          tile.height = WALL_TILE_SIZE
          tile.alpha = 0.8
          this.districtLayer.addChild(tile)
        }

        // Left wall
        const sideWallCount = Math.max(1, Math.floor(wh / WALL_TILE_SIZE))
        for (let i = 0; i < sideWallCount; i++) {
          const tile = new Sprite(assets.getAnyTileTexture(wallTiles.v))
          tile.x = wx - WALL_TILE_SIZE / 2
          tile.y = wy + i * (wh / sideWallCount)
          tile.width = WALL_TILE_SIZE
          tile.height = wh / sideWallCount + 1
          tile.alpha = 0.8
          this.districtLayer.addChild(tile)
        }

        // Right wall
        for (let i = 0; i < sideWallCount; i++) {
          const tile = new Sprite(assets.getAnyTileTexture(wallTiles.v))
          tile.x = wx + ww - WALL_TILE_SIZE / 2
          tile.y = wy + i * (wh / sideWallCount)
          tile.width = WALL_TILE_SIZE
          tile.height = wh / sideWallCount + 1
          tile.alpha = 0.8
          this.districtLayer.addChild(tile)
        }

        // Corner towers (larger, slightly overlapping)
        const towerSize = WALL_TILE_SIZE * 1.4
        const corners = [
          { x: wx - towerSize / 2, y: wy - towerSize / 2, key: wallTiles.tl },
          { x: wx + ww - towerSize / 2, y: wy - towerSize / 2, key: wallTiles.tr },
          { x: wx - towerSize / 2, y: wy + wh - towerSize / 2, key: wallTiles.bl },
          { x: wx + ww - towerSize / 2, y: wy + wh - towerSize / 2, key: wallTiles.br },
        ]
        for (const corner of corners) {
          const ts = new Graphics()
          ts.roundRect(corner.x + 2, corner.y + 2, towerSize, towerSize, 3)
          ts.fill({ color: 0x000000, alpha: 0.25 })
          this.districtLayer.addChild(ts)

          const tile = new Sprite(assets.getAnyTileTexture(corner.key))
          tile.x = corner.x
          tile.y = corner.y
          tile.width = towerSize
          tile.height = towerSize
          tile.alpha = 0.9
          this.districtLayer.addChild(tile)
        }
      }

      // ── Internal roads from district layout ──
      if (spriteAtlas.isReady && districtLayout.roads.main.length >= 2) {
        const internalRoadTileSize = 10 // slightly smaller than inter-district roads
        const roadMat = biomeMats.roadInternal // Use dungeon-style internal road tiles

        // Collect all road segments (main road + branches)
        const allSegments: { x: number; y: number }[][] = [districtLayout.roads.main]
        for (const branch of districtLayout.roads.branches) {
          allSegments.push(branch)
        }

        // Collect building pixel rects in this district for road-building overlap filtering
        const districtBuildingRects: { x: number; y: number; w: number; h: number }[] = []
        for (const bld of store.buildings.values()) {
          if (bld.district_id !== district.id) continue
          if (bld.health <= 0 && bld.file_count <= 0) continue
          const bp = this.worldToPixel(bld.position)
          districtBuildingRects.push({
            x: bp.x,
            y: bp.y,
            w: bld.footprint.width * TILE_SIZE,
            h: bld.footprint.height * TILE_SIZE,
          })
        }

        // Generate autotiled road grid for internal roads
        const internalRoadGrid = AutotileEngine.generateRoadGrid(
          allSegments.map(seg => seg.map(p => ({
            // Road waypoints are in tile coordinates relative to wall rect,
            // convert to pixel coordinates
            x: p.x * WALL_TILE_SIZE,
            y: p.y * WALL_TILE_SIZE,
          }))),
          internalRoadTileSize,
        )

        for (const [, rt] of internalRoadGrid) {
          // Skip road tiles that overlap building footprints
          const tileRect = {
            x: rt.x, y: rt.y,
            w: internalRoadTileSize, h: internalRoadTileSize,
          }
          if (rectsOverlap(tileRect, districtBuildingRects)) continue

          // Use position-based seed for deterministic variant mixing
          const variantSeed = Math.abs(Math.round(rt.x * 7 + rt.y * 13))
          const roadTex = spriteAtlas.resolve('road', roadMat, rt.role, variantSeed)
          const tile = new Sprite(roadTex)
          tile.x = rt.x + internalRoadTileSize / 2
          tile.y = rt.y + internalRoadTileSize / 2
          tile.width = internalRoadTileSize
          tile.height = internalRoadTileSize
          tile.anchor.set(0.5)
          tile.rotation = rt.rotation
          tile.alpha = 0.6
          this.districtLayer.addChild(tile)
        }
      }

      // ── Decorations from district layout ──
      if (spriteAtlas.isReady && districtLayout.decorations.length > 0) {
        const decorTileSize = 12
        for (const decor of districtLayout.decorations) {
          // Convert decoration tile coordinates to pixel positions
          const dx = decor.x * WALL_TILE_SIZE
          const dy = decor.y * WALL_TILE_SIZE

          // Only render if inside the wall rect
          if (dx >= wx && dx < wx + ww && dy >= wy && dy < wy + wh) {
            const decorTex = spriteAtlas.resolve(decor.family, decor.material, decor.role)
            const decorSprite = new Sprite(decorTex)
            decorSprite.x = dx
            decorSprite.y = dy
            decorSprite.width = decorTileSize
            decorSprite.height = decorTileSize
            decorSprite.alpha = 0.55
            this.districtLayer.addChild(decorSprite)
          }
        }
      }

      // ── Clickable/hoverable hit area ──
      const distHit = new Graphics()
      distHit.rect(pos.x, pos.y, w, h)
      distHit.fill({ color: 0xffffff, alpha: 0.001 })
      distHit.eventMode = 'static'
      distHit.cursor = 'pointer'
      distHit.on('pointerdown', (e) => {
        e.stopPropagation()
        useUIStore.getState().selectEntity(district.id, 'district')
      })
      distHit.on('pointerover', () => {
        useUIStore.getState().hoverEntity(district.id, 'district')
      })
      distHit.on('pointerout', () => {
        const ui = useUIStore.getState()
        if (ui.hoveredEntityId === district.id) {
          ui.hoverEntity(null, null)
        }
      })
      this.districtHitContainer.addChild(distHit)

      // ── District name banner (centered at bottom of walls) ──
      const label = new Text({ text: district.name, style: districtLabelStyle })
      const lx = cx - label.width / 2
      const ly = wy + wh + 4

      const lPill = new Graphics()
      lPill.roundRect(lx - 6, ly - 3, label.width + 12, label.height + 6, 5)
      lPill.fill({ color: darken(biomeColor, 0.2), alpha: 0.8 })
      lPill.stroke({ color: lighten(biomeColor, 0.3), alpha: 0.5, width: 1 })
      this.labelContainer.addChild(lPill)

      label.x = lx
      label.y = ly
      label.alpha = 1.0
      this.labelContainer.addChild(label)

      // ── % complete badge (only visible on hover) ──
      // Compute district completion as average building health
      const districtBuildings = [...store.buildings.values()].filter(b => b.district_id === district.id)
      if (districtBuildings.length > 0) {
        const avgHealth = Math.round(
          districtBuildings.reduce((sum, b) => sum + b.health, 0) / districtBuildings.length
        )
        const isHovered = useUIStore.getState().hoveredEntityId === district.id
        if (isHovered) {
          const badgeText = `${avgHealth}%`
          const badge = new Text({ text: badgeText, style: badgeStyle })
          const bx = cx - badge.width / 2
          const by = wy - WALL_TILE_SIZE / 2 - badge.height - 8

          const badgeBg = new Graphics()
          badgeBg.roundRect(bx - 6, by - 3, badge.width + 12, badge.height + 6, 4)
          badgeBg.fill({ color: 0x000000, alpha: 0.7 })
          badgeBg.stroke({ color: avgHealth >= 80 ? 0x27ae60 : avgHealth >= 50 ? 0xf39c12 : 0xe74c3c, alpha: 0.6, width: 1 })
          this.labelContainer.addChild(badgeBg)

          badge.x = bx
          badge.y = by
          this.labelContainer.addChild(badge)
        }
      }
    }
  }

  // =========================================================================
  // Layer 3.5: Roads / paths connecting districts
  //
  // Uses a Minimum Spanning Tree to connect districts on each island,
  // avoiding duplicate/redundant connections. Roads are rendered as
  // repeating Kenney path/cobblestone tiles with right-angle (L-shaped) turns.
  // =========================================================================

  private renderRoads(
    districts: Map<string, District>,
    islands: Map<string, Island>,
  ): void {
    const store = useUniverseStore.getState()
    const connections = store.connections

    if (connections.length > 0) {
      // Use explicit connections from the data model
      for (const conn of connections) {
        const d1 = districts.get(conn.from_district_id)
        const d2 = districts.get(conn.to_district_id)
        if (!d1 || !d2) continue
        const island = islands.get(d1.island_id)
        const biome = island?.biome ?? 'urban'
        this.renderRoad(d1, d2, biome, conn.connection_type, conn.label)
      }
    } else {
      // Fallback: MST connections for islands without explicit connections
      const byIsland = new Map<string, District[]>()
      for (const d of districts.values()) {
        const arr = byIsland.get(d.island_id) ?? []
        arr.push(d)
        byIsland.set(d.island_id, arr)
      }

      for (const [islandId, dists] of byIsland) {
        const island = islands.get(islandId)
        if (!island || dists.length < 2) continue
        const edges = this.computeMSTEdges(dists)
        for (const [d1, d2] of edges) {
          this.renderRoad(d1, d2, island.biome, 'general')
        }
      }
    }
  }

  /**
   * Kruskal's MST — returns pairs of districts to connect.
   * Produces exactly (N-1) edges for N districts, no duplicates.
   */
  private computeMSTEdges(dists: District[]): [District, District][] {
    if (dists.length < 2) return []

    // Build all candidate edges sorted by distance
    const candidates: { i: number; j: number; dist: number }[] = []
    for (let i = 0; i < dists.length; i++) {
      for (let j = i + 1; j < dists.length; j++) {
        const d1 = dists[i]!
        const d2 = dists[j]!
        const p1 = this.worldToPixel(d1.position)
        const p2 = this.worldToPixel(d2.position)
        const cx1 = p1.x + (d1.bounds.width * TILE_SIZE) / 2
        const cy1 = p1.y + (d1.bounds.height * TILE_SIZE) / 2
        const cx2 = p2.x + (d2.bounds.width * TILE_SIZE) / 2
        const cy2 = p2.y + (d2.bounds.height * TILE_SIZE) / 2
        const dx = cx2 - cx1
        const dy = cy2 - cy1
        candidates.push({ i, j, dist: dx * dx + dy * dy })
      }
    }
    candidates.sort((a, b) => a.dist - b.dist)

    // Union-Find
    const parent = dists.map((_, i) => i)
    const find = (x: number): number => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]! }
      return x
    }
    const union = (a: number, b: number): boolean => {
      const ra = find(a), rb = find(b)
      if (ra === rb) return false
      parent[ra] = rb
      return true
    }

    const result: [District, District][] = []
    for (const edge of candidates) {
      if (union(edge.i, edge.j)) {
        result.push([dists[edge.i]!, dists[edge.j]!])
        if (result.length === dists.length - 1) break
      }
    }
    return result
  }

  /**
   * Render a single road between two districts using Kenney path tiles.
   * The road uses an L-shaped right-angle path:
   *   1. Exit from the nearest edge of district 1
   *   2. Travel horizontal or vertical
   *   3. Make a right-angle turn
   *   4. Enter the nearest edge of district 2
   *
   * Roads are clipped so they never render on top of district interiors or
   * buildings. Only tiles in the gap between districts are drawn.
   */
  private renderRoad(
    d1: District, d2: District, _biome: string,
    connectionType: string = 'general', connectionLabel?: string,
  ): void {
    const assets = AssetLoader.instance
    const store = useUniverseStore.getState()
    // Use the wall tile size for road tiles so the connector width exactly
    // matches the gate aperture carved in the wall perimeter.
    const roadTileSize = WALL_TILE_SIZE

    // District wall rectangles in pixel space — use the same snapped geometry
    // as renderDistricts so roads connect to the actual wall edges.
    const p1 = this.worldToPixel(d1.position)
    const p2 = this.worldToPixel(d2.position)
    const r1 = computeWallRect(p1, d1.bounds.width * TILE_SIZE, d1.bounds.height * TILE_SIZE)
    const r2 = computeWallRect(p2, d2.bounds.width * TILE_SIZE, d2.bounds.height * TILE_SIZE)

    // Prefer gate‑aligned exits so the connector meets the carved wall gate
    // openings. Fallback to overlap-aware exits when gates are unavailable.
    const chooseGateAlignedExits = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
      try {
        const layout1 = this.getDistrictLayout(d1, r1)
        const layout2 = this.getDistrictLayout(d2, r2)
        const c1x = r1.x + r1.w / 2, c1y = r1.y + r1.h / 2
        const c2x = r2.x + r2.w / 2, c2y = r2.y + r2.h / 2
        const horiz = Math.abs(c2x - c1x) >= Math.abs(c2y - c1y)

        if (horiz) {
          const leftIsD1 = c1x < c2x
          const d1Side: 'e' | 'w' = leftIsD1 ? 'e' : 'w'
          const d2Side: 'e' | 'w' = leftIsD1 ? 'w' : 'e'
          const g1s = layout1.gates.filter(g => g.direction === d1Side)
          const g2s = layout2.gates.filter(g => g.direction === d2Side)
          if (g1s.length && g2s.length) {
            const targetY = leftIsD1 ? c2y : c1y
            const g1 = g1s.reduce((best, g) => Math.abs(g.y - targetY) < Math.abs(best.y - targetY) ? g : best)
            const g2 = g2s.reduce((best, g) => Math.abs(g.y - targetY) < Math.abs(best.y - targetY) ? g : best)
            const e1x = leftIsD1 ? r1.x + r1.w : r1.x
            const e2x = leftIsD1 ? r2.x : r2.x + r2.w
            return [{ x: e1x, y: g1.y }, { x: e2x, y: g2.y }]
          }
        } else {
          const topIsD1 = c1y < c2y
          const d1Side: 'n' | 's' = topIsD1 ? 's' : 'n'
          const d2Side: 'n' | 's' = topIsD1 ? 'n' : 's'
          const g1s = layout1.gates.filter(g => g.direction === d1Side)
          const g2s = layout2.gates.filter(g => g.direction === d2Side)
          if (g1s.length && g2s.length) {
            const targetX = topIsD1 ? c2x : c1x
            const g1 = g1s.reduce((best, g) => Math.abs(g.x - targetX) < Math.abs(best.x - targetX) ? g : best)
            const g2 = g2s.reduce((best, g) => Math.abs(g.x - targetX) < Math.abs(best.x - targetX) ? g : best)
            const e1y = topIsD1 ? r1.y + r1.h : r1.y
            const e2y = topIsD1 ? r2.y : r2.y + r2.h
            return [{ x: g1.x, y: e1y }, { x: g2.x, y: e2y }]
          }
        }
      } catch { /* ignore and fall back */ }
      return null
    }

    // Compute exit points using gate alignment when possible; otherwise fall back
    // to overlap-aware logic for straighter roads.
    const gateExits = chooseGateAlignedExits()
    const [exit1, exit2] = gateExits ?? this.computeSmartExits(r1, r2)

    // Build L-shaped waypoint path with right-angle turn
    let waypoints = this.computeRoadWaypoints(exit1.x, exit1.y, exit2.x, exit2.y)

    // Nudge the first and last waypoint outward by half a road tile so
    // stamped tiles do not bleed into the interior of the two endpoint
    // districts. This keeps the connector visually flush with the walls
    // without drawing inside them (see Team research demo overlap bug).
    // Account for wall thickness: walls are rendered centered on the wallRect
    // edge and extend WALL_TILE_SIZE/2 outside the rect. To avoid drawing road
    // tiles over the wall sprites, push the endpoints by roadHalf + wallHalf.
    const roadHalf = roadTileSize / 2
    const wallHalf = WALL_TILE_SIZE / 2
    // Keep start/end close to the gate so the first/last tile can overlap the
    // gate aperture slightly (roads render below walls). This avoids a visible
    // gap without painting into the district interior.
    const endpointPad = Math.max(0, roadHalf - 1)
    if (waypoints.length >= 2) {
      // Adjust start → move away from the wall along the first segment axis
      const sdx = waypoints[1]!.x - waypoints[0]!.x
      const sdy = waypoints[1]!.y - waypoints[0]!.y
      if (Math.abs(sdx) >= Math.abs(sdy)) {
        // Horizontal first segment
        const span = Math.abs(sdx)
        const pad = Math.min(endpointPad, Math.max(0, span / 2 - 0.5))
        waypoints[0]!.x += Math.sign(sdx || 1) * pad
      } else {
        // Vertical first segment
        const span = Math.abs(sdy)
        const pad = Math.min(endpointPad, Math.max(0, span / 2 - 0.5))
        waypoints[0]!.y += Math.sign(sdy || 1) * pad
      }

      // Adjust end → move away from the wall along the last segment axis
      const last = waypoints.length - 1
      const edx = waypoints[last]!.x - waypoints[last - 1]!.x
      const edy = waypoints[last]!.y - waypoints[last - 1]!.y
      if (Math.abs(edx) >= Math.abs(edy)) {
        const span = Math.abs(edx)
        const pad = Math.min(endpointPad, Math.max(0, span / 2 - 0.5))
        waypoints[last]!.x -= Math.sign(edx || 1) * pad
      } else {
        const span = Math.abs(edy)
        const pad = Math.min(endpointPad, Math.max(0, span / 2 - 0.5))
        waypoints[last]!.y -= Math.sign(edy || 1) * pad
      }
    }

    // Compute gate slots at each endpoint: a rectangular aperture through the
    // wall where tiles are allowed to render. Anywhere the road overlaps the
    // endpoint wall OUTSIDE this slot is skipped.
    const startIsHorizontal = Math.abs(waypoints[1]!.x - waypoints[0]!.x) >= Math.abs(waypoints[1]!.y - waypoints[0]!.y)
    const endIsHorizontal = Math.abs(waypoints[waypoints.length - 1]!.x - waypoints[waypoints.length - 2]!.x) >=
                            Math.abs(waypoints[waypoints.length - 1]!.y - waypoints[waypoints.length - 2]!.y)
    const makeGateSlot = (
      wall: { x: number; y: number; w: number; h: number },
      exit: { x: number; y: number },
      horiz: boolean,
    ): { x: number; y: number; w: number; h: number } => {
      if (horiz) {
        // Horizontal road passes through a vertical wall: slot spans wall thickness in X
        const isRight = Math.abs(exit.x - (wall.x + wall.w)) < 2
        const gapExtend = roadHalf + 2 // extend into the gap so near-edge tiles are allowed
        return {
          x: (isRight ? (wall.x + wall.w - wallHalf) : (wall.x - wallHalf - gapExtend)),
          y: exit.y - roadHalf,
          w: WALL_TILE_SIZE + (isRight ? gapExtend : gapExtend),
          h: roadTileSize,
        }
      } else {
        // Vertical road passes through a horizontal wall: slot spans wall thickness in Y
        const isBottom = Math.abs(exit.y - (wall.y + wall.h)) < 2
        const gapExtend = roadHalf + 2
        return {
          x: exit.x - roadHalf,
          y: (isBottom ? (wall.y + wall.h - wallHalf) : (wall.y - wallHalf - gapExtend)),
          w: roadTileSize,
          h: WALL_TILE_SIZE + (isBottom ? gapExtend : gapExtend),
        }
      }
    }
    const gateSlot1 = makeGateSlot(r1, exit1, startIsHorizontal)
    const gateSlot2 = makeGateSlot(r2, exit2, endIsHorizontal)

    // Pick road tile key and border color based on connection type
    const roadStyle = CONNECTION_ROAD_STYLES[connectionType] ?? CONNECTION_ROAD_STYLES.general!

    // Collect obstacle rects: third-party district wall rects + building footprints.
    // Exclude the two endpoint districts (d1, d2) so road tiles can reach
    // right up to their walls and visually span the gap.
    const obstacleRects: { x: number; y: number; w: number; h: number }[] = []
    for (const dist of store.districts.values()) {
      if (dist.id === d1.id || dist.id === d2.id) continue
      const dp = this.worldToPixel(dist.position)
      const dr = computeWallRect(dp, dist.bounds.width * TILE_SIZE, dist.bounds.height * TILE_SIZE)
      obstacleRects.push(dr)
    }
    for (const bld of store.buildings.values()) {
      if (bld.health <= 0 && bld.file_count <= 0) continue
      const bp = this.worldToPixel(bld.position)
      obstacleRects.push({
        x: bp.x,
        y: bp.y,
        w: bld.footprint.width * TILE_SIZE,
        h: bld.footprint.height * TILE_SIZE,
      })
    }

    // Draw shadow underneath — single rect per segment, matching road width exactly
    // Shadows also skip inside district rects
    const hw = roadTileSize / 2
    const shadowG = new Graphics()
    for (let w = 0; w < waypoints.length - 1; w++) {
      const ax = waypoints[w]!.x, ay = waypoints[w]!.y
      const bx = waypoints[w + 1]!.x, by = waypoints[w + 1]!.y
      if (Math.abs(bx - ax) > Math.abs(by - ay)) {
        const minX = Math.min(ax, bx)
        const segLen = Math.abs(bx - ax)
        const segRect = { x: minX + 2, y: ay - hw + 2, w: segLen, h: roadTileSize }
        const hitsStartWall = rectsOverlap(segRect, [r1]) && !rectsOverlap(segRect, [gateSlot1])
        const hitsEndWall = rectsOverlap(segRect, [r2]) && !rectsOverlap(segRect, [gateSlot2])
        if (!rectsOverlap(segRect, obstacleRects) && !hitsStartWall && !hitsEndWall) {
          shadowG.rect(segRect.x, segRect.y, segRect.w, segRect.h)
        }
      } else {
        const minY = Math.min(ay, by)
        const segLen = Math.abs(by - ay)
        const segRect = { x: ax - hw + 2, y: minY + 2, w: roadTileSize, h: segLen }
        const hitsStartWall = rectsOverlap(segRect, [r1]) && !rectsOverlap(segRect, [gateSlot1])
        const hitsEndWall = rectsOverlap(segRect, [r2]) && !rectsOverlap(segRect, [gateSlot2])
        if (!rectsOverlap(segRect, obstacleRects) && !hitsStartWall && !hitsEndWall) {
          shadowG.rect(segRect.x, segRect.y, segRect.w, segRect.h)
        }
      }
    }
    shadowG.fill({ color: 0x000000, alpha: 0.15 })
    this.roadLayer.addChild(shadowG)

    if (spriteAtlas.isReady) {
      // V2: Autotiled road rendering with connector material
      const roadMat = resolveBiomeMaterials(_biome).roadConnector
      const roadGrid = AutotileEngine.generateRoadGrid([waypoints], roadTileSize)

      for (const [, rt] of roadGrid) {
        // Skip road tiles that overlap any district wall rect or building
        const tileRect = { x: rt.x, y: rt.y, w: roadTileSize, h: roadTileSize }
        if (rectsOverlap(tileRect, obstacleRects)) continue
        // Block tiles if they overlap the endpoint walls outside the gate slots
        const badAtStart = rectsOverlap(tileRect, [r1]) && !rectsOverlap(tileRect, [gateSlot1])
        const badAtEnd = rectsOverlap(tileRect, [r2]) && !rectsOverlap(tileRect, [gateSlot2])
        if (badAtStart || badAtEnd) continue

        // Use position-based seed for deterministic variant mixing
        const variantSeed = Math.abs(Math.round(rt.x * 7 + rt.y * 13))
        const roadTex = spriteAtlas.resolve('road', roadMat, rt.role, variantSeed)
        const tile = new Sprite(roadTex)
        tile.x = rt.x + roadTileSize / 2
        tile.y = rt.y + roadTileSize / 2
        tile.width = roadTileSize
        tile.height = roadTileSize
        tile.anchor.set(0.5)
        tile.rotation = rt.rotation
        tile.alpha = 0.85
        this.roadLayer.addChild(tile)
      }
    } else {
      // Legacy fallback: single texture stamped along each segment
      const roadTex = assets.getRoadTileTexture(roadStyle.tileKey)

      for (let w = 0; w < waypoints.length - 1; w++) {
        const ax = waypoints[w]!.x, ay = waypoints[w]!.y
        const bx = waypoints[w + 1]!.x, by = waypoints[w + 1]!.y

        const dx = bx - ax
        const dy = by - ay
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len < 1) continue

        const tileCount = Math.max(1, Math.ceil(len / roadTileSize))
        const stepX = dx / tileCount
        const stepY = dy / tileCount

        for (let s = 0; s < tileCount; s++) {
          const tx = ax + stepX * (s + 0.5)
          const ty = ay + stepY * (s + 0.5)

          // Skip tiles inside district wall rects or buildings
          const tileRect = { x: tx - roadTileSize / 2, y: ty - roadTileSize / 2, w: roadTileSize, h: roadTileSize }
          if (rectsOverlap(tileRect, obstacleRects)) continue
          const badAtStart = rectsOverlap(tileRect, [r1]) && !rectsOverlap(tileRect, [gateSlot1])
          const badAtEnd = rectsOverlap(tileRect, [r2]) && !rectsOverlap(tileRect, [gateSlot2])
          if (badAtStart || badAtEnd) continue

          const tile = new Sprite(roadTex)
          tile.width = roadTileSize
          tile.height = roadTileSize
          tile.anchor.set(0.5)
          tile.x = tx
          tile.y = ty
          tile.alpha = 0.85
          this.roadLayer.addChild(tile)
        }
      }
    }

    // Draw border lines along road edges for definition (color per connection type)
    // Also skip borders inside district rects
    const borderG = new Graphics()
    const borderColor = darken(roadStyle.borderColor, 0.15)
    const bHw = hw + 1 // border half-width = road half-width + 1px for border offset
    for (let w = 0; w < waypoints.length - 1; w++) {
      const ax = waypoints[w]!.x, ay = waypoints[w]!.y
      const bx = waypoints[w + 1]!.x, by = waypoints[w + 1]!.y

      // Check if the segment center is inside an obstacle — skip entirely if so
      const midX = (ax + bx) / 2
      const midY = (ay + by) / 2
      const midRect = { x: midX - 1, y: midY - 1, w: 2, h: 2 }
      if (rectsOverlap(midRect, obstacleRects)) continue
      // Skip drawing borders that would overlap endpoint walls outside gates
      const segRect = {
        x: Math.min(ax, bx),
        y: Math.min(ay, by),
        w: Math.abs(bx - ax) || 1,
        h: Math.abs(by - ay) || 1,
      }
      const hitsStartWall = rectsOverlap(segRect, [r1]) && !rectsOverlap(segRect, [gateSlot1])
      const hitsEndWall = rectsOverlap(segRect, [r2]) && !rectsOverlap(segRect, [gateSlot2])
      if (hitsStartWall || hitsEndWall) continue

      if (Math.abs(bx - ax) > Math.abs(by - ay)) {
        // Horizontal — draw top and bottom border lines
        const minX = Math.min(ax, bx)
        const maxX = Math.max(ax, bx)
        borderG.moveTo(minX, ay - bHw).lineTo(maxX, ay - bHw)
        borderG.stroke({ color: borderColor, alpha: 0.3, width: 1 })
        borderG.moveTo(minX, ay + bHw).lineTo(maxX, ay + bHw)
        borderG.stroke({ color: borderColor, alpha: 0.2, width: 1 })
      } else {
        // Vertical — draw left and right border lines
        const minY = Math.min(ay, by)
        const maxY = Math.max(ay, by)
        borderG.moveTo(ax - bHw, minY).lineTo(ax - bHw, maxY)
        borderG.stroke({ color: borderColor, alpha: 0.3, width: 1 })
        borderG.moveTo(ax + bHw, minY).lineTo(ax + bHw, maxY)
        borderG.stroke({ color: borderColor, alpha: 0.2, width: 1 })
      }
    }
    this.roadLayer.addChild(borderG)

    // Road label at the midpoint — only if outside obstacles
    const displayLabel = connectionLabel ?? roadStyle.label
    if (displayLabel) {
      // Robust centering: pick the segment that actually spans the
      // inter‑district gap and center the label on that segment.
      // This avoids drift from endpoint padding or small L‑bends.
      let mx: number | null = null
      let my: number | null = null
      const gapLeftX = Math.min(r1.x + r1.w, r2.x + r2.w)
      const gapRightX = Math.max(r1.x, r2.x)
      const gapTopY = Math.min(r1.y + r1.h, r2.y + r2.h)
      const gapBottomY = Math.max(r1.y, r2.y)

      let bestLen = -1
      for (let i = 0; i < waypoints.length - 1; i++) {
        const ax = waypoints[i]!.x, ay = waypoints[i]!.y
        const bx = waypoints[i + 1]!.x, by = waypoints[i + 1]!.y
        if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
          // Horizontal segment — intersect with horizontal gap band
          const segMin = Math.min(ax, bx)
          const segMax = Math.max(ax, bx)
          const ix0 = Math.max(segMin, gapLeftX)
          const ix1 = Math.min(segMax, gapRightX)
          const ilen = ix1 - ix0
          if (ilen > bestLen) {
            bestLen = ilen
            if (ilen > 0) { mx = (ix0 + ix1) / 2; my = ay }
          }
        } else {
          // Vertical segment — intersect with vertical gap band
          const segMin = Math.min(ay, by)
          const segMax = Math.max(ay, by)
          const iy0 = Math.max(segMin, gapTopY)
          const iy1 = Math.min(segMax, gapBottomY)
          const ilen = iy1 - iy0
          if (ilen > bestLen) {
            bestLen = ilen
            if (ilen > 0) { mx = ax; my = (iy0 + iy1) / 2 }
          }
        }
      }

      // Fallback to path midpoint if we didn't find a crossing segment
      if (mx === null || my === null) {
        const totalLen = waypoints.reduce((sum, wp, i) => {
          if (i === 0) return 0
          const prev = waypoints[i - 1]!
          return sum + Math.sqrt((wp.x - prev.x) ** 2 + (wp.y - prev.y) ** 2)
        }, 0)
        let target = totalLen / 2
        mx = waypoints[0]!.x
        my = waypoints[0]!.y
        for (let i = 1; i < waypoints.length; i++) {
          const prev = waypoints[i - 1]!
          const cur = waypoints[i]!
          const segLen = Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2)
          if (target <= segLen) {
            const t = target / segLen
            mx = prev.x + (cur.x - prev.x) * t
            my = prev.y + (cur.y - prev.y) * t
            break
          }
          target -= segLen
        }
      }

      // Only show label if it's not inside an obstacle
      const labelRect = { x: mx - 18, y: my - 9, w: 36, h: 18 }
      if (!rectsOverlap(labelRect, obstacleRects)) {
        const roadLabel = new Text({ text: displayLabel, style: fileLabelStyle })
        const lx = mx - roadLabel.width / 2
        const ly = my - roadLabel.height / 2
        roadLabel.x = lx
        roadLabel.y = ly
        roadLabel.alpha = 0.8

        const padX = 3
        const padY = 2
        const rlBg = new Graphics()
        rlBg.roundRect(lx - padX, ly - padY, roadLabel.width + padX * 2, roadLabel.height + padY * 2, 3)
        rlBg.fill({ color: 0x000000, alpha: 0.5 })

        this.labelContainer.addChild(rlBg)
        this.labelContainer.addChild(roadLabel)
      }
    }
  }

  /**
   * Compute exit points for a road between two district rects.
   * Uses the overlapping range on the perpendicular axis so side-by-side
   * districts get a straight horizontal (or vertical) bridge instead of
   * an L-shaped detour caused by differing centers.
   * Falls back to center-targeting (computeEdgeExit) when the rects
   * don't overlap on the perpendicular axis.
   */
  private computeSmartExits(
    r1: { x: number; y: number; w: number; h: number },
    r2: { x: number; y: number; w: number; h: number },
  ): [{ x: number; y: number }, { x: number; y: number }] {
    const c1x = r1.x + r1.w / 2, c1y = r1.y + r1.h / 2
    const c2x = r2.x + r2.w / 2, c2y = r2.y + r2.h / 2
    const dx = Math.abs(c2x - c1x)
    const dy = Math.abs(c2y - c1y)

    if (dx >= dy) {
      // Districts are primarily separated horizontally — check Y overlap
      const overlapMinY = Math.max(r1.y, r2.y)
      const overlapMaxY = Math.min(r1.y + r1.h, r2.y + r2.h)
      if (overlapMaxY > overlapMinY) {
        const sharedY = (overlapMinY + overlapMaxY) / 2
        // Exit on facing edges at the shared Y
        const e1x = c1x < c2x ? r1.x + r1.w : r1.x
        const e2x = c1x < c2x ? r2.x : r2.x + r2.w
        return [{ x: e1x, y: sharedY }, { x: e2x, y: sharedY }]
      }
    } else {
      // Districts are primarily separated vertically — check X overlap
      const overlapMinX = Math.max(r1.x, r2.x)
      const overlapMaxX = Math.min(r1.x + r1.w, r2.x + r2.w)
      if (overlapMaxX > overlapMinX) {
        const sharedX = (overlapMinX + overlapMaxX) / 2
        const e1y = c1y < c2y ? r1.y + r1.h : r1.y
        const e2y = c1y < c2y ? r2.y : r2.y + r2.h
        return [{ x: sharedX, y: e1y }, { x: sharedX, y: e2y }]
      }
    }

    // No overlap — fall back to center-targeting
    return [
      this.computeEdgeExit(r1, c2x, c2y),
      this.computeEdgeExit(r2, c1x, c1y),
    ]
  }

  /**
   * Compute where a road exits a district bounding box heading toward a target point.
   * Returns the point on the edge of the rect closest to the target.
   */
  private computeEdgeExit(
    rect: { x: number; y: number; w: number; h: number },
    targetX: number, targetY: number,
  ): { x: number; y: number } {
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    const dx = targetX - cx
    const dy = targetY - cy

    // Determine which edge to exit from based on direction to target
    if (Math.abs(dx) * rect.h > Math.abs(dy) * rect.w) {
      // Exit left or right edge
      if (dx > 0) {
        return { x: rect.x + rect.w, y: cy + dy * (rect.w / 2) / Math.abs(dx) }
      } else {
        return { x: rect.x, y: cy + dy * (rect.w / 2) / Math.abs(dx) }
      }
    } else {
      // Exit top or bottom edge
      if (dy > 0) {
        return { x: cx + dx * (rect.h / 2) / Math.abs(dy), y: rect.y + rect.h }
      } else {
        return { x: cx + dx * (rect.h / 2) / Math.abs(dy), y: rect.y }
      }
    }
  }

  /**
   * Build an L-shaped right-angle waypoint path between two points.
   * Always produces exactly one right-angle turn (3 waypoints)
   * unless the points are nearly axis-aligned (2 waypoints, straight line).
   */
  private computeRoadWaypoints(
    x1: number, y1: number,
    x2: number, y2: number,
  ): { x: number; y: number }[] {
    const dx = Math.abs(x2 - x1)
    const dy = Math.abs(y2 - y1)

    // Perfectly aligned on one axis → single straight segment
    if (dx < 2) {
      return [{ x: x1, y: y1 }, { x: x1, y: y2 }]
    }
    if (dy < 2) {
      return [{ x: x1, y: y1 }, { x: x2, y: y1 }]
    }

    // Always use L-shaped routing with a right-angle turn.
    // Deterministic bend direction based on endpoint hash.
    const seed = Math.abs(Math.round(x1 * 7 + y1 * 13 + x2 * 19 + y2 * 31))
    const horizontalFirst = seed % 2 === 0

    if (horizontalFirst) {
      // Horizontal then vertical (right-angle turn at (x2, y1))
      return [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
      ]
    } else {
      // Vertical then horizontal (right-angle turn at (x1, y2))
      return [
        { x: x1, y: y1 },
        { x: x1, y: y2 },
        { x: x2, y: y2 },
      ]
    }
  }

  // =========================================================================
  // Layer 4: Buildings — retained map + incremental updates
  //
  // V4: Buildings are tracked in buildingMap by ID. On structural renders
  // unchanged buildings are re-added from the map; only new/changed buildings
  // get their Container recreated. Diff-driven updateBuildingStats() enables
  // per-building visual updates without touching any other layer.
  // =========================================================================

  /** Create a display Container for a single building. Extracted from the old
   *  renderBuildingsLOD loop so it can be called per-building on demand. */
  private createBuildingContainer(building: Building): Container {
    const assets = AssetLoader.instance
    const pos = this.worldToPixel(building.position)
    const w = building.footprint.width * TILE_SIZE
    const h = building.footprint.height * TILE_SIZE
    const seed = hashString(building.id)
    const biome = this.getBuildingBiome(building)
    const biomeColor = BIOME_COLORS[biome] ?? 0x2c3e50
    const healthPct = building.health / 100

    const buildingContainer = new Container()
    buildingContainer.label = `building-${building.id}`
    buildingContainer.eventMode = 'static'
    buildingContainer.cursor = 'pointer'
    buildingContainer.on('pointerdown', (e) => {
      e.stopPropagation()
      useUIStore.getState().selectEntity(building.id, 'building')
    })

    // --- Ground shadow ---
    const shadow = new Graphics()
    shadow.roundRect(pos.x + 4, pos.y + 4, w, h, 3)
    shadow.fill({ color: 0x000000, alpha: 0.3 })
    buildingContainer.addChild(shadow)

    // --- Plot background ---
    const plot = new Graphics()
    plot.roundRect(pos.x - 1, pos.y - 1, w + 2, h + 2, 4)
    plot.fill({ color: darken(biomeColor, 0.4), alpha: 0.85 })
    buildingContainer.addChild(plot)

    // --- Foundation ---
    const foundation = new Graphics()
    foundation.roundRect(pos.x - 2, pos.y + h - 4, w + 4, 6, 2)
    foundation.fill({ color: darken(biomeColor, 0.15), alpha: 0.6 })
    buildingContainer.addChild(foundation)

    // --- Body tiles: BuildingComposer (compositional) or legacy fallback ---
    if (spriteAtlas.isReady) {
      // V2: Compositional building rendering via BuildingComposer
      const materialState = building.health <= 30 ? 'ghost' as const : 'solid' as const
      const composed = composeBuilding(
        building.footprint, building.style, biome,
        building.health, seed, materialState,
      )

      for (let cy = 0; cy < composed.height; cy++) {
        for (let cx = 0; cx < composed.width; cx++) {
          const cell = composed.grid[cy]![cx]!
          if (!cell.visible) continue
          const cellTex = spriteAtlas.resolve(cell.family, cell.material, cell.role, seed)
          const sprite = new Sprite(cellTex)
          sprite.x = pos.x + cx * TILE_SIZE
          sprite.y = pos.y + cy * TILE_SIZE
          sprite.width = TILE_SIZE
          sprite.height = TILE_SIZE
          sprite.alpha = cell.alpha
          buildingContainer.addChild(sprite)
        }
      }

      // Scaffolding for incomplete buildings — simplified sprite-based
      if (building.health < 100) {
        for (let cy = 0; cy < composed.height; cy++) {
          for (let cx = 0; cx < composed.width; cx++) {
            const cell = composed.grid[cy]![cx]!
            if (cell.visible) continue
            // Draw scaffolding crate at low alpha for invisible cells
            const scaffTex = spriteAtlas.resolve('decoration', 'default', 'scaffolding', seed)
            const scaffSprite = new Sprite(scaffTex)
            scaffSprite.x = pos.x + cx * TILE_SIZE
            scaffSprite.y = pos.y + cy * TILE_SIZE
            scaffSprite.width = TILE_SIZE
            scaffSprite.height = TILE_SIZE
            scaffSprite.alpha = 0.2
            buildingContainer.addChild(scaffSprite)
          }
        }
      }
    } else {
      // Legacy fallback: single texture stamped uniformly
      const variant = seed % 4
      const tex = assets.getBuildingTexture(biome, variant)
      const totalTiles = building.footprint.width * building.footprint.height
      const visibleTiles = Math.ceil(totalTiles * healthPct)
      let tileIndex = 0

      for (let by = building.footprint.height - 1; by >= 0; by--) {
        for (let bx = 0; bx < building.footprint.width; bx++) {
          tileIndex++
          if (tileIndex > visibleTiles) break
          const sprite = new Sprite(tex)
          sprite.x = pos.x + bx * TILE_SIZE
          sprite.y = pos.y + by * TILE_SIZE
          sprite.width = TILE_SIZE
          sprite.height = TILE_SIZE
          sprite.alpha = 0.7 + healthPct * 0.3
          buildingContainer.addChild(sprite)
        }
        if (tileIndex > visibleTiles) break
      }

      // Legacy scaffolding
      if (building.health < 100) {
        const scaffolding = new Graphics()
        scaffolding.rect(pos.x - 3, pos.y, 2, h)
        scaffolding.fill({ color: 0x8b6914, alpha: 0.5 })
        scaffolding.rect(pos.x + w + 1, pos.y, 2, h)
        scaffolding.fill({ color: 0x8b6914, alpha: 0.5 })
        const beamCount = Math.max(2, building.footprint.height)
        for (let bi = 0; bi < beamCount; bi++) {
          const beamY = pos.y + (h / beamCount) * (bi + 0.5)
          scaffolding.rect(pos.x - 3, beamY, w + 6, 1)
          scaffolding.fill({ color: 0x8b6914, alpha: 0.35 })
        }
        scaffolding.moveTo(pos.x - 3, pos.y)
        scaffolding.lineTo(pos.x + w + 3, pos.y + h)
        scaffolding.stroke({ color: 0x8b6914, alpha: 0.2, width: 1 })
        buildingContainer.addChild(scaffolding)
      }

      // Legacy roof
      const roofHeight = 8
      const style = building.style

      if (building.health >= 100) {
        if (style === 'modern_office') {
          const roof = new Graphics()
          roof.rect(pos.x - 2, pos.y - 2, w + 4, 4)
          roof.fill({ color: darken(biomeColor, 0.15), alpha: 0.7 })
          roof.stroke({ color: lighten(biomeColor, 0.15), alpha: 0.4, width: 1 })
          buildingContainer.addChild(roof)
        } else if (style === 'factory') {
          const roof = new Graphics()
          roof.rect(pos.x - 2, pos.y - 2, w + 4, 4)
          roof.fill({ color: darken(biomeColor, 0.15), alpha: 0.7 })
          buildingContainer.addChild(roof)
        } else {
          const roof = new Graphics()
          roof.moveTo(pos.x - 2, pos.y + 2)
          roof.lineTo(pos.x + w / 2, pos.y - roofHeight)
          roof.lineTo(pos.x + w + 2, pos.y + 2)
          roof.closePath()
          roof.fill({ color: darken(biomeColor, 0.15), alpha: 0.7 })
          roof.stroke({ color: lighten(biomeColor, 0.15), alpha: 0.4, width: 1 })
          buildingContainer.addChild(roof)
        }
      }
    }

    // --- Health border ---
    const healthColor = this.getHealthColor(building.health)
    const border = new Graphics()
    border.roundRect(pos.x, pos.y, w, h, 3)
    border.stroke({ color: healthColor, alpha: 0.6, width: 1.5 })
    buildingContainer.addChild(border)

    // --- Hit area ---
    const hitArea = new Graphics()
    hitArea.rect(pos.x - 2, pos.y - 10, w + 4, h + 16)
    hitArea.fill({ color: 0xffffff, alpha: 0.001 })
    buildingContainer.addChild(hitArea)

    buildingContainer.on('pointerover', () => {
      useUIStore.getState().hoverEntity(building.id, 'building')
    })
    buildingContainer.on('pointerout', () => {
      const ui = useUIStore.getState()
      if (ui.hoveredEntityId === building.id) {
        ui.hoverEntity(null, null)
      }
    })

    // --- Ghost styling (health ≤ 30) ---
    if (building.health <= 30) {
      buildingContainer.alpha = 0.35
      buildingContainer.tint = 0x8888aa
    }

    return buildingContainer
  }

  /**
   * Create a "planned outline" container for a building that hasn't been built yet.
   * Shows a dashed/dotted border at the planned footprint size, indicating where
   * the building will eventually be constructed during replay.
   */
  private createPlannedOutline(building: Building): Container {
    const pos = this.worldToPixel(building.position)
    const fp = building.planned_footprint ?? building.footprint
    const w = fp.width * TILE_SIZE
    const h = fp.height * TILE_SIZE
    const biome = this.getBuildingBiome(building)
    const biomeColor = BIOME_COLORS[biome] ?? 0x2c3e50

    const container = new Container()
    container.label = `planned-${building.id}`
    container.eventMode = 'static'
    container.cursor = 'pointer'
    container.on('pointerdown', (e) => {
      e.stopPropagation()
      useUIStore.getState().selectEntity(building.id, 'building')
    })

    // Faint fill showing the planned plot
    const plotFill = new Graphics()
    plotFill.roundRect(pos.x, pos.y, w, h, 3)
    plotFill.fill({ color: biomeColor, alpha: 0.08 })
    container.addChild(plotFill)

    // Dashed border outline — draw as series of short segments
    const outline = new Graphics()
    const dashLen = 4
    const gapLen = 3
    const strokeColor = biomeColor
    const strokeAlpha = 0.35

    // Top edge
    let cursor = 0
    while (cursor < w) {
      const segLen = Math.min(dashLen, w - cursor)
      outline.moveTo(pos.x + cursor, pos.y)
      outline.lineTo(pos.x + cursor + segLen, pos.y)
      outline.stroke({ color: strokeColor, alpha: strokeAlpha, width: 1 })
      cursor += dashLen + gapLen
    }
    // Bottom edge
    cursor = 0
    while (cursor < w) {
      const segLen = Math.min(dashLen, w - cursor)
      outline.moveTo(pos.x + cursor, pos.y + h)
      outline.lineTo(pos.x + cursor + segLen, pos.y + h)
      outline.stroke({ color: strokeColor, alpha: strokeAlpha, width: 1 })
      cursor += dashLen + gapLen
    }
    // Left edge
    cursor = 0
    while (cursor < h) {
      const segLen = Math.min(dashLen, h - cursor)
      outline.moveTo(pos.x, pos.y + cursor)
      outline.lineTo(pos.x, pos.y + cursor + segLen)
      outline.stroke({ color: strokeColor, alpha: strokeAlpha, width: 1 })
      cursor += dashLen + gapLen
    }
    // Right edge
    cursor = 0
    while (cursor < h) {
      const segLen = Math.min(dashLen, h - cursor)
      outline.moveTo(pos.x + w, pos.y + cursor)
      outline.lineTo(pos.x + w, pos.y + cursor + segLen)
      outline.stroke({ color: strokeColor, alpha: strokeAlpha, width: 1 })
      cursor += dashLen + gapLen
    }
    container.addChild(outline)

    // "Planned" label at low opacity
    const label = new Text({
      text: building.name,
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 7,
        fill: biomeColor,
        align: 'center',
      }),
    })
    label.alpha = 0.25
    label.anchor.set(0.5, 0)
    label.x = pos.x + w / 2
    label.y = pos.y + h + 2
    container.addChild(label)

    container.alpha = 0.5

    return container
  }

  /**
   * V4: Reconcile buildings from store against the retained buildingMap.
   * Adds new buildings, removes deleted ones, rebuilds changed ones.
   * Unchanged buildings are re-added to the display list from the map.
   */
  private reconcileBuildings(): void {
    const store = useUniverseStore.getState()
    const tier = this.currentZoomTier
    const showBuildings = tier !== 'universe' && tier !== 'orbital'

    // Detach all from display list (map still holds references)
    this.buildingContainer.removeChildren()

    // Remove buildings no longer in store
    for (const [id, entry] of this.buildingMap) {
      if (!store.buildings.has(id)) {
        entry.container.destroy({ children: true })
        this.buildingMap.delete(id)
      }
    }

    // Add / update / re-attach buildings
    for (const building of store.buildings.values()) {
      if (building.health <= 0 && building.file_count <= 0) {
        // Not yet built — render planned outline if available, otherwise skip
        if (building.planned_footprint && building.planned_file_count && building.planned_file_count > 0) {
          const existing = this.buildingMap.get(building.id)
          if (existing && existing.health === -1) {
            // Already showing planned outline — re-attach
            if (showBuildings) {
              this.buildingContainer.addChild(existing.container)
            }
          } else {
            // Create planned outline container
            if (existing) {
              existing.container.destroy({ children: true })
            }
            const container = this.createPlannedOutline(building)
            if (showBuildings) {
              this.buildingContainer.addChild(container)
            }
            this.buildingMap.set(building.id, {
              container,
              health: -1, // Sentinel for "planned outline" state
              fileCount: 0,
            })
          }
        } else {
          const existing = this.buildingMap.get(building.id)
          if (existing) {
            existing.container.destroy({ children: true })
            this.buildingMap.delete(building.id)
          }
        }
        continue
      }

      const existing = this.buildingMap.get(building.id)
      if (existing) {
        if (existing.health !== building.health || existing.fileCount !== building.file_count) {
          // Stats changed — rebuild this building's container
          existing.container.destroy({ children: true })
          const container = this.createBuildingContainer(building)
          if (showBuildings) {
            this.buildingContainer.addChild(container)
          }
          this.buildingMap.set(building.id, {
            container,
            health: building.health,
            fileCount: building.file_count,
          })
        } else {
          // Unchanged — just re-attach to display list
          if (showBuildings) {
            this.buildingContainer.addChild(existing.container)
          }
        }
      } else {
        // New building
        const container = this.createBuildingContainer(building)
        if (showBuildings) {
          this.buildingContainer.addChild(container)
        }
        this.buildingMap.set(building.id, {
          container,
          health: building.health,
          fileCount: building.file_count,
        })
      }
    }

    this.updateBuildingVisibility()

    // Tile overlays (street/interior zoom)
    if (tier === 'street' || tier === 'interior') {
      this.tileLayer.removeChildren()
      this.renderTileOverlays(store.buildings, store.tiles)
    }
  }

  /**
   * V4: Direct building stats update from worker diffs. Accumulates updates
   * and flushes at ≤ 10 Hz (100ms) to cap container rebuilds under burst.
   * Last-write-wins: only the latest stats per building ID are kept.
   */
  updateBuildingStats(id: string, fileCount: number, health: number): void {
    const existing = this.buildingMap.get(id)
    if (!existing) return
    if (existing.health === health && existing.fileCount === fileCount) return
    // LWW: overwrite any pending update for this building
    this.pendingBuildingUpdates.set(id, { fileCount, health })
  }

  /** V4.5: Flush pending building stats updates at capped cadence */
  private flushPendingBuildingUpdates(): void {
    if (this.pendingBuildingUpdates.size === 0) return
    const now = performance.now()
    if (now - this.lastBuildingFlush < TilemapManager.BUILDING_FLUSH_INTERVAL_MS) return
    this.lastBuildingFlush = now

    const store = useUniverseStore.getState()
    for (const [id, update] of this.pendingBuildingUpdates) {
      const existing = this.buildingMap.get(id)
      if (!existing) continue
      if (existing.health === update.health && existing.fileCount === update.fileCount) continue

      const building = store.buildings.get(id)
      if (!building) continue

      // Patch building with diff values for rendering
      const patched = { ...building, health: update.health, file_count: update.fileCount }

      this.buildingContainer.removeChild(existing.container)
      existing.container.destroy({ children: true })

      if (update.health <= 0 && update.fileCount <= 0) {
        this.buildingMap.delete(id)
        continue
      }

      const container = this.createBuildingContainer(patched)
      this.buildingContainer.addChild(container)
      this.buildingMap.set(id, { container, health: update.health, fileCount: update.fileCount })
    }
    this.pendingBuildingUpdates.clear()
  }

  /**
   * V4: Lightweight hover badge update — only touches one badge overlay,
   * not the full label layer or any other rendering.
   */
  private updateHoverBadge(): void {
    // Clear previous hover badge
    if (this.hoverBadgeObjects) {
      this.labelContainer.removeChild(this.hoverBadgeObjects.bg)
      this.labelContainer.removeChild(this.hoverBadgeObjects.text)
      this.hoverBadgeObjects.bg.destroy()
      this.hoverBadgeObjects.text.destroy()
      this.hoverBadgeObjects = null
    }

    const hoveredId = this.currentHoveredId
    if (!hoveredId) return

    // Building hover badge
    const store = useUniverseStore.getState()
    const building = store.buildings.get(hoveredId)
    if (!building || building.health <= 0) return
    if (!this.buildingMap.has(hoveredId)) return

    const pos = this.worldToPixel(building.position)
    const w = building.footprint.width * TILE_SIZE
    const roofHeight = 8
    const pctText = `${Math.round(building.health)}%`
    const badge = new Text({ text: pctText, style: badgeStyle })
    const bx = pos.x + w / 2 - badge.width / 2
    const by = pos.y - roofHeight - badge.height - 6

    const badgeBg = new Graphics()
    badgeBg.roundRect(bx - 5, by - 3, badge.width + 10, badge.height + 6, 4)
    badgeBg.fill({ color: 0x000000, alpha: 0.7 })
    badgeBg.stroke({ color: this.getHealthColor(building.health), alpha: 0.5, width: 1 })
    this.labelContainer.addChild(badgeBg)

    badge.x = bx
    badge.y = by
    this.labelContainer.addChild(badge)

    this.hoverBadgeObjects = { bg: badgeBg, text: badge }
  }

  // =========================================================================
  // Layer 5: File tile overlays (street/interior zoom)
  // =========================================================================

  private renderTileOverlays(
    buildings: Map<string, Building>,
    tiles: Map<string, Tile>,
  ): void {
    const assets = AssetLoader.instance

    for (const tile of tiles.values()) {
      // Complete tiles don't need an overlay — the building composition already
      // represents them. Only show overlays for in-progress / damaged states.
      if (tile.state === 'complete') continue

      const building = buildings.get(tile.building_id)
      if (!building) continue

      const bPos = this.worldToPixel(building.position)
      const tx = bPos.x + tile.position.x * TILE_SIZE
      const ty = bPos.y + tile.position.y * TILE_SIZE

      const tileTex = assets.getTileTexture(tile.state)
      const tileSprite = new Sprite(tileTex)
      tileSprite.x = tx + 1
      tileSprite.y = ty + 1
      tileSprite.width = TILE_SIZE - 2
      tileSprite.height = TILE_SIZE - 2
      tileSprite.alpha = 0.6
      this.tileLayer.addChild(tileSprite)
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private getBuildingBiome(building: Building): string {
    const store = useUniverseStore.getState()
    const district = store.districts.get(building.district_id)
    if (district?.biome_override) return district.biome_override
    if (district) {
      const island = store.islands.get(district.island_id)
      if (island) return island.biome
    }
    return 'urban'
  }

  private getHealthColor(health: number): number {
    if (health >= 80) return 0x27ae60
    if (health >= 50) return 0xf39c12
    if (health > 0) return 0xe74c3c
    return 0x555555
  }

  // =========================================================================
  // Selection highlight — renders a glowing outline on selected entity
  // =========================================================================

  updateSelectionHighlight(
    entityId: string | null,
    entityType: 'agent' | 'monster' | 'workitem' | 'building' | 'district' | null,
  ): void {
    this.selectionHighlightContainer.removeChildren()

    if (!entityId || !entityType) return

    const pulse = 0.5 + 0.5 * Math.sin(this.selectionPulsePhase)
    const glowAlpha = 0.3 + pulse * 0.4
    const borderAlpha = 0.6 + pulse * 0.4
    const glowWidth = 4 + pulse * 3

    if (entityType === 'building') {
      const store = useUniverseStore.getState()
      const building = store.buildings.get(entityId)
      if (!building) return

      const pos = this.worldToPixel(building.position)
      const w = building.footprint.width * TILE_SIZE
      const h = building.footprint.height * TILE_SIZE

      // Outer glow stroke (cyan)
      const glow = new Graphics()
      glow.roundRect(pos.x - 3, pos.y - 3, w + 6, h + 6, 4)
      glow.stroke({ color: SELECTION_HIGHLIGHT.glow, alpha: glowAlpha * 0.5, width: glowWidth })
      this.selectionHighlightContainer.addChild(glow)

      // Inner crisp border (white)
      const border = new Graphics()
      border.roundRect(pos.x - 1, pos.y - 1, w + 2, h + 2, 3)
      border.stroke({ color: SELECTION_HIGHLIGHT.border, alpha: borderAlpha, width: 2 })
      this.selectionHighlightContainer.addChild(border)
    }

    if (entityType === 'district') {
      const store = useUniverseStore.getState()
      const district = store.districts.get(entityId)

      // Use the rectangular wall shape for selection highlight.
      // Try cache first; if not available (e.g., render hasn't run yet or cache
      // was just cleared), compute the rect directly from the district data.
      let rect = this.districtRectCache.get(entityId)
      if (!rect) {
        if (!district) return
        const pos = this.worldToPixel(district.position)
        const w = district.bounds.width * TILE_SIZE
        const h = district.bounds.height * TILE_SIZE
        // Use the same snapped geometry as renderDistricts
        rect = computeWallRect(pos, w, h)
      }

      // ── Universal high-contrast highlight ──
      // White border + cyan glow reads as "selected" against any biome wall color.

      // Filled selection tint (visible through fog)
      const fill = new Graphics()
      fill.roundRect(rect.x, rect.y, rect.w, rect.h, 4)
      fill.fill({ color: SELECTION_HIGHLIGHT.fill, alpha: 0.10 + pulse * 0.08 })
      this.selectionHighlightContainer.addChild(fill)

      // Outer glow (cyan, soft)
      const glow = new Graphics()
      glow.roundRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8, 5)
      glow.stroke({ color: SELECTION_HIGHLIGHT.glow, alpha: glowAlpha * 0.6, width: glowWidth + 1 })
      this.selectionHighlightContainer.addChild(glow)

      // Inner crisp border (white — maximum contrast on any background)
      const border = new Graphics()
      border.roundRect(rect.x - 1, rect.y - 1, rect.w + 2, rect.h + 2, 3)
      border.stroke({ color: SELECTION_HIGHLIGHT.border, alpha: borderAlpha, width: 2.5 })
      this.selectionHighlightContainer.addChild(border)
    }
  }

  /** Flash a building's tint to a color, then lerp back to white.
   *  Used for tool action feedback — shows which building is being worked on. */
  flashBuildingTint(buildingId: string, color: number, duration = 500): void {
    this.buildingTints.set(buildingId, {
      color,
      startTime: Date.now(),
      duration,
    })
    // Apply the tint immediately to the building sprite
    this.applyBuildingTint(buildingId, color)
  }

  /** Find a building sprite and set its tint */
  private applyBuildingTint(buildingId: string, tint: number): void {
    const label = `building-${buildingId}`
    for (const child of this.buildingContainer.children) {
      if (child.label === label) {
        // The building container may contain multiple children (sprite, shadow, etc.)
        // Tint the first Sprite child we find
        if (child instanceof Sprite) {
          child.tint = tint
        } else if (child instanceof Container) {
          for (const grandchild of child.children) {
            if (grandchild instanceof Sprite) {
              grandchild.tint = tint
              break
            }
          }
        }
        break
      }
    }
  }

  /** Update building tints — lerp from tool color back to white */
  private updateBuildingTints(): void {
    const now = Date.now()
    const toRemove: string[] = []

    for (const [buildingId, tintState] of this.buildingTints) {
      const elapsed = now - tintState.startTime
      const progress = Math.min(1, elapsed / tintState.duration)

      if (progress >= 1) {
        // Restore to white (no tint)
        this.applyBuildingTint(buildingId, 0xffffff)
        toRemove.push(buildingId)
        continue
      }

      // Lerp each RGB channel from tint color → white (0xff)
      const r0 = (tintState.color >> 16) & 0xff
      const g0 = (tintState.color >> 8) & 0xff
      const b0 = tintState.color & 0xff
      const r = Math.round(r0 + (0xff - r0) * progress)
      const g = Math.round(g0 + (0xff - g0) * progress)
      const b = Math.round(b0 + (0xff - b0) * progress)
      const lerpedTint = (r << 16) | (g << 8) | b
      this.applyBuildingTint(buildingId, lerpedTint)
    }

    for (const id of toRemove) {
      this.buildingTints.delete(id)
    }
  }

  markDirty(): void {
    this.structureDirty = true
    this.cacheDirty = true
  }

  /** Clear all caches and retained state, then trigger a full re-render.
   *  Unlike destroy(), this keeps containers alive for reuse. */
  reset(): void {
    this.coastlineCache.clear()
    this.islandBoundsCache.clear()
    this.districtPolyCache.clear()
    this.districtRectCache.clear()
    this.districtLayoutCache.clear()
    this.buildingTints.clear()
    this.pendingBuildingUpdates.clear()
    // Destroy retained building containers (they'll be recreated on next render)
    for (const entry of this.buildingMap.values()) {
      try {
        entry.container.destroy({ children: true })
      } catch {
        // PixiJS may already be torn down — safe to ignore
      }
    }
    this.buildingMap.clear()
    this.hoverBadgeObjects = null
    this.markDirty()
    this.buildingsDirty = true
  }

  destroy(): void {
    this.unsubscribeUniverse?.()
    this.unsubscribeUI?.()
    this.coastlineCache.clear()
    this.islandBoundsCache.clear()
    this.districtPolyCache.clear()
    this.districtRectCache.clear()
    this.districtLayoutCache.clear()
    // Destroy retained building containers
    for (const entry of this.buildingMap.values()) {
      entry.container.destroy({ children: true })
    }
    this.buildingMap.clear()
    this.pendingBuildingUpdates.clear()
    this.hoverBadgeObjects = null
    this.container.destroy({ children: true })
    this.buildingContainer.destroy({ children: true })
    this.districtHitContainer.destroy({ children: true })
    this.selectionHighlightContainer.destroy({ children: true })
    this.labelContainer.destroy({ children: true })
  }
}
