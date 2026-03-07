// ============================================================================
// Event Marker Manager — Small sprite icons on the map at event locations
// Shows world events (errors, deploys, file changes, etc.) as 10×10px icons.
// ============================================================================

import { Container, Sprite } from 'pixi.js'
import { useEventStore, classifyEvent } from '../stores/eventStore'
import { useUniverseStore } from '../stores/universeStore'
import { AssetLoader } from './AssetLoader'
import { entitySprites } from './entity-sprite-map'
import { ObjectPool } from './ObjectPool'

const TILE_SIZE = 32
const CHUNK_SIZE = 64
const MARKER_SIZE = 10
const MARKER_LIFETIME = 10000 // 10 seconds visible
const MARKER_FADE_DURATION = 2000 // 2 second fade out
const SCALE_IN_DURATION = 200 // 200ms scale-in animation

interface EventMarker {
  container: Container
  sprite: Sprite
  eventId: string
  createdAt: number
}

export class EventMarkerManager {
  container: Container
  private markers: Map<string, EventMarker> = new Map()
  private unsubscribe: (() => void) | null = null
  private pool: ObjectPool<EventMarker>
  private lastEventCount = 0

  constructor() {
    this.container = new Container()
    this.container.label = 'event-markers'
    this.container.zIndex = 9

    this.pool = new ObjectPool<EventMarker>(
      () => this.createMarker(),
      (marker) => this.resetMarker(marker),
    )
    this.pool.preAllocate(10)

    // Subscribe to event store
    this.unsubscribe = useEventStore.subscribe(() => {
      this.syncMarkers()
    })
  }

  private createMarker(): EventMarker {
    const container = new Container()
    const sprite = new Sprite()
    sprite.anchor.set(0.5)
    sprite.width = MARKER_SIZE
    sprite.height = MARKER_SIZE
    container.addChild(sprite)

    return {
      container,
      sprite,
      eventId: '',
      createdAt: 0,
    }
  }

  private resetMarker(marker: EventMarker): void {
    marker.container.visible = false
    marker.container.alpha = 1
    marker.container.scale.set(1)
    if (marker.container.parent) {
      marker.container.parent.removeChild(marker.container)
    }
  }

  private getEventPosition(event: { target?: { building_id?: string; district_id?: string; island_id?: string } }): { x: number; y: number } | null {
    const buildings = useUniverseStore.getState().buildings
    const districts = useUniverseStore.getState().districts
    const islands = useUniverseStore.getState().islands

    // Try building position
    if (event.target?.building_id) {
      const building = buildings.get(event.target.building_id)
      if (building) {
        return {
          x: (building.position.chunk_x * CHUNK_SIZE + building.position.local_x) * TILE_SIZE + (building.footprint.width * TILE_SIZE) / 2,
          y: (building.position.chunk_y * CHUNK_SIZE + building.position.local_y) * TILE_SIZE,
        }
      }
    }

    // Try district position
    if (event.target?.district_id) {
      const district = districts.get(event.target.district_id)
      if (district) {
        return {
          x: (district.position.chunk_x * CHUNK_SIZE + district.position.local_x) * TILE_SIZE + (district.bounds.width * TILE_SIZE) / 2,
          y: (district.position.chunk_y * CHUNK_SIZE + district.position.local_y) * TILE_SIZE,
        }
      }
    }

    // Try island position
    if (event.target?.island_id) {
      const island = islands.get(event.target.island_id)
      if (island) {
        return {
          x: (island.position.chunk_x * CHUNK_SIZE + island.position.local_x) * TILE_SIZE + (island.bounds.width * TILE_SIZE) / 2,
          y: (island.position.chunk_y * CHUNK_SIZE + island.position.local_y) * TILE_SIZE,
        }
      }
    }

    return null
  }

  private syncMarkers(): void {
    const events = useEventStore.getState().eventLog
    // Guard against cursor desync when maxLogSize trims the array
    if (events.length < this.lastEventCount) {
      this.lastEventCount = 0
    }
    if (events.length === this.lastEventCount) return

    // Only process new events
    const newEvents = events.slice(this.lastEventCount)
    this.lastEventCount = events.length

    const assets = AssetLoader.instance

    for (const log of newEvents) {
      const category = classifyEvent(log.event)
      if (!category) continue

      // Don't duplicate
      if (this.markers.has(log.event.id)) continue

      const pos = this.getEventPosition(log.event)
      if (!pos) continue

      const marker = this.pool.acquire()
      marker.eventId = log.event.id
      marker.createdAt = Date.now()
      marker.container.visible = true
      marker.container.x = pos.x
      marker.container.y = pos.y - 8 // Slight offset above the location
      marker.container.scale.set(0) // Start at 0 for scale-in
      marker.container.alpha = 1

      // Set texture from tileset via EntitySpriteMap
      const spriteKey = entitySprites.resolveEvent(category)
      const tex = assets.getAnyTileTexture(spriteKey)
      marker.sprite.texture = tex
      marker.sprite.width = MARKER_SIZE
      marker.sprite.height = MARKER_SIZE

      this.markers.set(log.event.id, marker)
      this.container.addChild(marker.container)
    }
  }

  /** Call each frame — handles scale-in, lifetime, and fade-out */
  update(): void {
    const now = Date.now()
    const toRemove: string[] = []

    for (const [id, marker] of this.markers) {
      const age = now - marker.createdAt

      if (age < SCALE_IN_DURATION) {
        // Scale-in animation
        const progress = age / SCALE_IN_DURATION
        marker.container.scale.set(progress)
      } else if (age < MARKER_LIFETIME) {
        // Visible at full size
        marker.container.scale.set(1)
        marker.container.alpha = 1
      } else if (age < MARKER_LIFETIME + MARKER_FADE_DURATION) {
        // Fade out
        const fadeProgress = (age - MARKER_LIFETIME) / MARKER_FADE_DURATION
        marker.container.alpha = 1 - fadeProgress
        marker.container.scale.set(1)
      } else {
        // Remove
        toRemove.push(id)
      }
    }

    for (const id of toRemove) {
      const marker = this.markers.get(id)
      if (marker) {
        this.pool.release(marker)
        this.markers.delete(id)
      }
    }
  }

  destroy(): void {
    this.unsubscribe?.()
    this.pool.releaseAll()
    this.container.destroy({ children: true })
    this.markers.clear()
  }
}
