// ============================================================================
// World Renderer — Main PixiJS Application orchestrator
// Layer order: tilemap → buildings → workitems → agents → fog → UI
// ============================================================================

import { Application } from 'pixi.js'
import { CameraController } from './CameraController'
import { TilemapManager } from './TilemapManager'
import { FogOfWar } from './FogOfWar'
import { AgentManager } from './AgentManager'
import { MonsterManager } from './MonsterManager'
import { WorkItemMarkerManager } from './WorkItemMarker'
import { HeatOverlayManager } from './HeatOverlayManager'
import { OccupancyAnimator } from './OccupancyAnimator'
import { AssetLoader } from './AssetLoader'
import { useAgentStore } from '../stores/agentStore'
import { useUniverseStore } from '../stores/universeStore'
import { useUIStore } from '../stores/uiStore'
import { useEventStore } from '../stores/eventStore'
import type { AgentEvent } from '@multiverse/shared'
import type { DiffChange } from '../replay/diff'
import { isGpuEnabled, GpuOverlayManager } from '../gpu'
import type { GpuTelemetry } from '../gpu'

export class WorldRenderer {
  app: Application
  camera: CameraController | null = null
  tilemap: TilemapManager | null = null
  fog: FogOfWar | null = null
  agentManager: AgentManager | null = null
  monsterManager: MonsterManager | null = null
  workItemMarkers: WorkItemMarkerManager | null = null
  heatOverlay: HeatOverlayManager | null = null
  occupancyAnimator: OccupancyAnimator | null = null
  /** V4_GPU: Optional WebGPU overlay manager (null when GPU path inactive) */
  gpuOverlay: GpuOverlayManager | null = null
  private initialized = false
  private unsubscribeEvents: (() => void) | null = null
  private unsubscribeSelection: (() => void) | null = null
  /** Previous follow ID — used to detect follow transitions */
  private _prevFollowId: string | null = null
  /** V4: Last telemetry snapshot from worker diffs */
  _lastTelemetry: { frameTimeP95: number; diffRate: number; heapEstimate: number; eventThroughput: number } | null = null
  /** V4_GPU: Last GPU telemetry snapshot */
  _lastGpuTelemetry: GpuTelemetry | null = null

  constructor() {
    this.app = new Application()
  }

  async init(container: HTMLElement): Promise<void> {
    if (this.initialized) return

    await this.app.init({
      background: 0x0a0a0f,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: container,
    })

    container.appendChild(this.app.canvas)

    // Initialize asset loader (generates placeholder textures)
    await AssetLoader.instance.init(this.app.renderer)

    // Create camera (viewport)
    this.camera = new CameraController(this.app)
    this.app.stage.addChild(this.camera.viewport)

    // Enable zIndex-based sorting so explicit layer order is respected
    this.camera.viewport.sortableChildren = true

    // ---------------------------------------------------------------
    // Viewport layer stack (zIndex order):
    //
    //   0  tilemap ground    — water, islands, decorations, districts, roads
    //   4  district hits     — invisible click areas for district selection
    //   5  buildings         — building structures (separate container so
    //                          island coastlines/beaches never render on top)
    //   6  occupancy         — work/delete/rename tile animations
    //   8  workitem markers  — quest markers
    //  10  labels            — all text labels (island, district, building names)
    //  39  heat overlay      — heat/halo glow for recent write activity
    //  40  fog               — fog-of-war overlay (eventMode=none)
    //  41  monsters          — error/incident monster sprites (ABOVE fog)
    //  42  agents            — agent sprites (ABOVE fog + monsters)
    //  45  selection highlight — ABOVE fog so always visible
    // ---------------------------------------------------------------

    this.tilemap = new TilemapManager()

    // Ground layers (water, islands, decorations, districts, roads)
    this.tilemap.container.zIndex = 0
    this.camera.viewport.addChild(this.tilemap.container)

    // District hit areas — between ground and buildings so district clicks
    // are tested before falling through to ground but after buildings.
    this.tilemap.districtHitContainer.zIndex = 4
    this.camera.viewport.addChild(this.tilemap.districtHitContainer)

    // Buildings — separate viewport-level container so they're guaranteed
    // above all ground layers (fixes coastline/beach rendering over buildings)
    this.tilemap.buildingContainer.zIndex = 5
    this.camera.viewport.addChild(this.tilemap.buildingContainer)

    // Occupancy animations — just above buildings so tile pulses overlay
    // building graphics but stay below labels and fog
    this.occupancyAnimator = new OccupancyAnimator()
    this.occupancyAnimator.container.zIndex = 6
    this.camera.viewport.addChild(this.occupancyAnimator.container)

    this.workItemMarkers = new WorkItemMarkerManager()
    this.workItemMarkers.container.zIndex = 8
    this.camera.viewport.addChild(this.workItemMarkers.container)

    // Labels — above buildings + work items so text is always readable
    this.tilemap.labelContainer.zIndex = 10
    this.camera.viewport.addChild(this.tilemap.labelContainer)

    // Heat overlay — warm glow on buildings with recent write activity.
    // Between labels and fog so halos are visible but beneath fog-of-war.
    this.heatOverlay = new HeatOverlayManager()
    this.heatOverlay.container.zIndex = 39
    this.camera.viewport.addChild(this.heatOverlay.container)

    this.fog = new FogOfWar()
    this.fog.container.zIndex = 40
    // CRITICAL: Fog must not intercept pointer events — clicks need to
    // pass through to agents and buildings underneath
    this.fog.container.eventMode = 'none'
    this.fog.container.interactiveChildren = false
    this.camera.viewport.addChild(this.fog.container)

    // Monsters — ABOVE fog so error sprites are always visible
    this.monsterManager = new MonsterManager()
    this.monsterManager.container.zIndex = 41
    this.camera.viewport.addChild(this.monsterManager.container)

    // Agents — ABOVE fog and monsters so agents are always visible
    this.agentManager = new AgentManager()
    this.agentManager.container.zIndex = 42
    this.camera.viewport.addChild(this.agentManager.container)

    // Selection highlight — ABOVE fog so highlights are always visible
    // regardless of fog-of-war coverage. Uses stroke outlines + subtle fill.
    this.tilemap.selectionHighlightContainer.zIndex = 45
    this.camera.viewport.addChild(this.tilemap.selectionHighlightContainer)

    // Subscribe to events for tool animations
    this.unsubscribeEvents = useEventStore.subscribe((state) => {
      const lastEvent = state.eventLog[state.eventLog.length - 1]
      if (lastEvent) {
        this.onEvent(lastEvent.event)
      }
    })

    // Subscribe to selection changes — bring clicked buildings/landmarks
    // to front of their layer (agents always stay on top)
    this.unsubscribeSelection = useUIStore.subscribe((state) => {
      this.bringSelectedToFront(state.selectedEntityId, state.selectedEntityType)
    })

    // V4_GPU: Initialize WebGPU overlay if flag is enabled.
    // This is async but non-blocking — GPU path activates when ready.
    // CPU path remains fully functional regardless.
    if (isGpuEnabled()) {
      this.initGpuOverlay().catch(() => {
        // GPU init failure is non-fatal — CPU path covers all functionality
      })
    }

    // Start render loop
    this.app.ticker.add(() => this.update())

    this.initialized = true

    // Center camera on content AFTER everything is initialized and rendered.
    // Use requestAnimationFrame to ensure the viewport has its final layout.
    requestAnimationFrame(() => {
      try {
        this.centerOnContent()
      } catch {
        // pixi-viewport may not have center computed yet on first frame
      }
      // Force tilemap re-render after camera repositioning
      this.tilemap?.markDirty()
    })
  }

  /** Bring the selected entity's container to the front of its layer.
   *  Buildings → front of buildingContainer. Agents always stay on top via zIndex.
   *  Also triggers selection highlight rendering. */
  private bringSelectedToFront(
    entityId: string | null,
    entityType: 'agent' | 'monster' | 'workitem' | 'building' | 'district' | null,
  ): void {
    // Always update the selection highlight (even for null — clears previous)
    this.tilemap?.updateSelectionHighlight(entityId, entityType)

    if (!entityId || !entityType) return

    if (entityType === 'building' && this.tilemap) {
      const buildings = this.tilemap.buildingContainer
      for (const child of buildings.children) {
        if (child.label === `building-${entityId}`) {
          // Move to end of children array → renders last → visually on top
          buildings.setChildIndex(child, buildings.children.length - 1)
          break
        }
      }
    }

    if (entityType === 'workitem' && this.workItemMarkers) {
      const markers = this.workItemMarkers.container
      for (const child of markers.children) {
        if (child.label === `workitem-${entityId}`) {
          markers.setChildIndex(child, markers.children.length - 1)
          break
        }
      }
    }

    // Agents always on top — no reordering needed (they're in a higher zIndex layer)
  }

  // ---------------------------------------------------------------
  // V4_GPU: Optional WebGPU overlay initialization
  // ---------------------------------------------------------------

  private async initGpuOverlay(): Promise<void> {
    const overlay = new GpuOverlayManager()
    const active = await overlay.init()
    if (active && this.camera) {
      // Insert GPU overlay at same zIndex as CPU heat overlay (39)
      // When GPU is active, the CPU HeatOverlayManager still runs but
      // the GPU heatmap provides higher-quality output
      overlay.container.zIndex = 39
      this.camera.viewport.addChild(overlay.container)
      this.gpuOverlay = overlay
      this._lastGpuTelemetry = overlay.telemetry
      console.info('[gpu] WebGPU overlay active — heatmap + markers accelerated')
    } else {
      overlay.destroy()
      console.info('[gpu] WebGPU unavailable — using CPU path')
    }
  }

  // ---------------------------------------------------------------
  // V4: Diff-driven rendering — apply typed diffs from replay worker
  // ---------------------------------------------------------------

  /** Apply worker diffs directly to subsystems, bypassing store → subscribe → full-render */
  applyDiffs(changes: DiffChange[]): void {
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i]!
      switch (change.type) {
        case 'agent_move':
          this.agentManager?.updateTargetFromDiff(change.id, change.x, change.y)
          break

        case 'building_stats':
          this.tilemap?.updateBuildingStats(change.id, change.file_count, change.health)
          break

        case 'fx':
          if (change.fx === 'tool_pulse' && change.target_id && this.tilemap) {
            this.tilemap.flashBuildingTint(change.target_id, change.color ?? 0xffd700, 300)
          }
          // V4_GPU: Heat FX diffs are handled by GPU overlay when active;
          // CPU HeatOverlayManager handles them via event store subscription regardless.
          break

        case 'tile_create':
          // Tile creation flows through stores; trigger building stats update
          // so the building visual rebuilds to include the new tile.
          if (this.tilemap) {
            // The store dispatch (via events) handles data integrity;
            // queue a building stats refresh so the renderer picks up the new tile count.
            const bldg = useUniverseStore.getState().buildings.get(change.building_id)
            if (bldg) {
              this.tilemap.updateBuildingStats(change.building_id, bldg.file_count, bldg.health)
            }
          }
          break

        case 'telemetry':
          this._lastTelemetry = {
            frameTimeP95: change.frameTimeP95,
            diffRate: change.diffRate,
            heapEstimate: change.heapEstimate,
            eventThroughput: change.eventThroughput,
          }
          break

        default:
          break
      }
    }
  }

  /** Center + fit the camera on the bounding box of all islands + agents */
  private centerOnContent(): void {
    if (!this.camera) return

    const { islands } = useUniverseStore.getState()
    const agents = useAgentStore.getState().agents
    const TILE_SIZE = 32
    const CHUNK_SIZE = 64

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const island of islands.values()) {
      const px = (island.position.chunk_x * CHUNK_SIZE + island.position.local_x) * TILE_SIZE
      const py = (island.position.chunk_y * CHUNK_SIZE + island.position.local_y) * TILE_SIZE
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px + island.bounds.width * TILE_SIZE)
      maxY = Math.max(maxY, py + island.bounds.height * TILE_SIZE)
    }

    for (const agent of agents.values()) {
      const px = (agent.position.chunk_x * CHUNK_SIZE + agent.position.local_x) * TILE_SIZE
      const py = (agent.position.chunk_y * CHUNK_SIZE + agent.position.local_y) * TILE_SIZE
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px + TILE_SIZE)
      maxY = Math.max(maxY, py + TILE_SIZE)
    }

    if (minX === Infinity) {
      this.camera.moveTo(0, 0)
      return
    }

    // Add padding around content (20% of content size)
    const contentW = maxX - minX
    const contentH = maxY - minY
    const pad = Math.max(contentW, contentH) * 0.2
    minX -= pad
    minY -= pad
    maxX += pad
    maxY += pad

    // Fit: compute zoom to show all content
    const vp = this.camera.viewport
    const screenW = vp.screenWidth
    const screenH = vp.screenHeight
    const fitW = (maxX - minX)
    const fitH = (maxY - minY)
    const fitZoom = Math.min(screenW / fitW, screenH / fitH)

    // Clamp to district-level range (0.4–0.8) so it's a nice starting view
    const clampedZoom = Math.max(0.4, Math.min(0.8, fitZoom))
    vp.setZoom(clampedZoom, true)

    // Center on content
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    this.camera.moveTo(cx, cy)
  }

  private onEvent(event: AgentEvent): void {
    // Flash the target building tint on tool_use events
    if (event.type === 'tool_use' && event.target?.tool_id) {
      if (event.target.building_id && this.tilemap) {
        const toolColor = AssetLoader.instance.getToolColor(event.target.tool_id)
        this.tilemap.flashBuildingTint(event.target.building_id, toolColor, 500)
      }
    }

    // Completion pulse on the agent when a task finishes
    if (event.type === 'task_complete') {
      this.agentManager?.playCompletionPulse(event.agent_id)
    }

    // Occupancy animations for building-targeted events
    if (this.occupancyAnimator && event.target?.building_id) {
      const TILE = 32
      const CHUNK = 64
      const building = useUniverseStore.getState().buildings.get(event.target.building_id)
      if (building) {
        const px = (building.position.chunk_x * CHUNK + building.position.local_x) * TILE
        const py = (building.position.chunk_y * CHUNK + building.position.local_y) * TILE
        const w = building.footprint.width * TILE
        const h = building.footprint.height * TILE

        if (event.type === 'tool_use') {
          this.occupancyAnimator.animateWork(event.target.building_id, px, py, w, h)
        } else if (event.type === 'file_delete') {
          this.occupancyAnimator.animateDelete(event.target.building_id, px, py, w, h)
        } else if (event.type === 'file_edit') {
          this.occupancyAnimator.animateRename(event.target.building_id, px, py, w, h)
        } else if (event.type === 'error_spawn') {
          this.occupancyAnimator.animateError(event.target.building_id, px, py, w, h)
        }
      }
    }
  }

  private update(): void {
    // Update all subsystems each frame
    this.tilemap?.update()
    this.agentManager?.update()
    this.monsterManager?.update()
    this.workItemMarkers?.update()
    this.heatOverlay?.update()
    this.occupancyAnimator?.update()

    // Pass interpolated agent pixel positions to fog so reveal circles
    // track agents smoothly during movement (not just on store updates)
    if (this.agentManager && this.fog) {
      this.fog.setAgentPositionOverrides(this.agentManager.getAllAgentPositions())
    }
    this.fog?.update()

    // V4_GPU: Collect GPU telemetry if overlay is active
    if (this.gpuOverlay?.active) {
      this._lastGpuTelemetry = this.gpuOverlay.telemetry
    }

    // Handle follow camera — detect transitions and pass position
    const followId = useUIStore.getState().followAgentId
    if (followId && this.camera && this.agentManager) {
      const pos = this.agentManager.getAgentPosition(followId)
      if (pos) {
        // Detect follow start: transition from null/different to this agent
        if (this._prevFollowId !== followId) {
          this.camera.followAgent(followId, pos.x, pos.y)
        }
        this.camera.updateFollowPosition(pos.x, pos.y)
      }
    } else if (this._prevFollowId && !followId && this.camera) {
      // Follow was cleared externally (e.g., by AgentPanel)
      if (this.camera.isFollowing) {
        this.camera.unfollowAgent()
      }
    }
    this._prevFollowId = followId
  }

  resize(): void {
    this.camera?.resize(this.app.canvas.width, this.app.canvas.height)
  }

  destroy(): void {
    this.unsubscribeEvents?.()
    this.unsubscribeSelection?.()
    this.camera?.destroy()
    this.tilemap?.destroy()
    this.agentManager?.destroy()
    this.monsterManager?.destroy()
    this.workItemMarkers?.destroy()
    this.heatOverlay?.destroy()
    this.occupancyAnimator?.destroy()
    this.fog?.destroy()
    this.gpuOverlay?.destroy()

    // Guard against PixiJS v8 destroy() crash when app hasn't fully initialized.
    // The `resizeTo` option sets up an internal `_cancelResize` during init —
    // calling destroy() before init completes (e.g., React strict mode double-mount)
    // throws "this._cancelResize is not a function".
    if (this.initialized) {
      try {
        this.app.destroy(true)
      } catch {
        // Swallow destroy errors — app is being torn down anyway
      }
    }
    this.initialized = false
  }
}
