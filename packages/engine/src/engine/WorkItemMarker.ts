// ============================================================================
// WorkItem Marker — Subtle quest pips on the map
// Small status-colored icon dots. No labels, no glow circles, no agent lines.
// Detail lives in the sidebar panel — the map marker is just a waypoint.
// ============================================================================

import { Container, Sprite } from 'pixi.js'
import type { WorkItem } from '@multiverse/shared'
import { useWorkItemStore } from '../stores/workItemStore'
import { useAgentStore } from '../stores/agentStore'
import { useUniverseStore } from '../stores/universeStore'
import { useUIStore } from '../stores/uiStore'
import { AssetLoader } from './AssetLoader'

const MARKER_SIZE = 10 // pip size in pixels
const TILE_SIZE = 32
const CHUNK_SIZE = 64

const STATUS_COLORS: Record<string, number> = {
  queued: 0xf39c12,
  active: 0x3498db,
  blocked: 0xe74c3c,
  done: 0x27ae60,
}

interface MarkerSprite {
  container: Container
  iconSprite: Sprite
  createdAt: number
}

export class WorkItemMarkerManager {
  container: Container
  private markers: Map<string, MarkerSprite> = new Map()
  private unsubscribe: (() => void) | null = null

  constructor() {
    this.container = new Container()
    this.container.label = 'workitem-markers'
    this.container.zIndex = 8

    this.unsubscribe = useWorkItemStore.subscribe(() => {
      this.syncMarkers()
    })
  }

  /** Compute marker position from map_anchor, related buildings, or assigned agent */
  private getMarkerPosition(wi: WorkItem): { x: number; y: number } {
    // 1. Use map_anchor if present
    if (wi.map_anchor?.position) {
      const p = wi.map_anchor.position
      return {
        x: (p.chunk_x * CHUNK_SIZE + p.local_x) * TILE_SIZE,
        y: (p.chunk_y * CHUNK_SIZE + p.local_y) * TILE_SIZE,
      }
    }

    // 2. Use first related building position (center-top, offset above)
    if (wi.related_entities?.building_ids?.length) {
      const buildings = useUniverseStore.getState().buildings
      const bld = buildings.get(wi.related_entities.building_ids[0]!)
      if (bld) {
        const pos = {
          x: (bld.position.chunk_x * CHUNK_SIZE + bld.position.local_x) * TILE_SIZE,
          y: (bld.position.chunk_y * CHUNK_SIZE + bld.position.local_y) * TILE_SIZE,
        }
        return {
          x: pos.x + (bld.footprint.width * TILE_SIZE) / 2,
          y: pos.y - TILE_SIZE * 0.5,
        }
      }
    }

    // 3. Use assigned agent position (offset above)
    if (wi.assigned_agent_id) {
      const agents = useAgentStore.getState().agents
      const agent = agents.get(wi.assigned_agent_id)
      if (agent) {
        return {
          x: (agent.position.chunk_x * CHUNK_SIZE + agent.position.local_x) * TILE_SIZE,
          y: (agent.position.chunk_y * CHUNK_SIZE + agent.position.local_y) * TILE_SIZE - TILE_SIZE,
        }
      }
    }

    // 4. Fallback: deterministic position near first island
    const islands = useUniverseStore.getState().islands
    const firstIsland = islands.values().next().value
    if (firstIsland) {
      const pos = {
        x: (firstIsland.position.chunk_x * CHUNK_SIZE + firstIsland.position.local_x) * TILE_SIZE,
        y: (firstIsland.position.chunk_y * CHUNK_SIZE + firstIsland.position.local_y) * TILE_SIZE,
      }
      const hash = this.hashId(wi.id)
      return {
        x: pos.x + (hash % 6) * TILE_SIZE * 2 + TILE_SIZE,
        y: pos.y - TILE_SIZE * 2 + ((hash >> 4) % 3) * TILE_SIZE,
      }
    }

    return { x: 10 * TILE_SIZE, y: 8 * TILE_SIZE }
  }

  private hashId(id: string): number {
    let h = 0
    for (let i = 0; i < id.length; i++) {
      h = ((h << 5) - h + id.charCodeAt(i)) | 0
    }
    return Math.abs(h)
  }

  private syncMarkers(): void {
    const workItems = useWorkItemStore.getState().workItems

    for (const wi of workItems.values()) {
      let marker = this.markers.get(wi.id)
      if (!marker) {
        marker = this.createMarker(wi)
        this.markers.set(wi.id, marker)
        this.container.addChild(marker.container)
      }
      this.updateMarker(marker, wi)
    }

    for (const [id, marker] of this.markers) {
      if (!workItems.has(id)) {
        this.container.removeChild(marker.container)
        marker.container.destroy({ children: true })
        this.markers.delete(id)
      }
    }
  }

  private createMarker(wi: WorkItem): MarkerSprite {
    const assets = AssetLoader.instance
    const container = new Container()
    container.label = `workitem-${wi.id}`

    const iconTex = assets.getWorkItemIconTexture(wi.status)
    const iconSprite = new Sprite(iconTex)
    iconSprite.anchor.set(0.5)
    iconSprite.width = MARKER_SIZE
    iconSprite.height = MARKER_SIZE
    container.addChild(iconSprite)

    // Clickable — opens work item panel
    container.eventMode = 'static'
    container.cursor = 'pointer'
    container.on('pointerdown', () => {
      useUIStore.getState().selectEntity(wi.id, 'workitem')
    })

    // Position using smart placement
    const pos = this.getMarkerPosition(wi)
    container.x = pos.x
    container.y = pos.y

    return {
      container,
      iconSprite,
      createdAt: Date.now(),
    }
  }

  private updateMarker(marker: MarkerSprite, wi: WorkItem): void {
    const assets = AssetLoader.instance
    const color = STATUS_COLORS[wi.status] ?? STATUS_COLORS.queued!

    // Reposition
    const newPos = this.getMarkerPosition(wi)
    marker.container.x = newPos.x
    marker.container.y = newPos.y

    // Update icon texture and tint
    marker.iconSprite.texture = assets.getWorkItemIconTexture(wi.status)
    marker.iconSprite.tint = color

    // Subtle pulse for queued items
    if (wi.status === 'queued') {
      const pulse = Math.sin(Date.now() / 600) * 0.08 + 1
      marker.container.scale.set(pulse)
    } else {
      marker.container.scale.set(1)
    }

    // Hide done markers immediately
    if (wi.status === 'done') {
      marker.container.visible = false
    } else {
      marker.container.visible = true
      marker.container.alpha = 1
    }
  }

  update(): void {
    const workItems = useWorkItemStore.getState().workItems
    for (const [id, marker] of this.markers) {
      const wi = workItems.get(id)
      if (wi?.status === 'queued') {
        const pulse = Math.sin(Date.now() / 600) * 0.08 + 1
        marker.container.scale.set(pulse)
      }
    }
  }

  destroy(): void {
    this.unsubscribe?.()
    this.container.destroy({ children: true })
    this.markers.clear()
  }
}
