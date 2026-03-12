// ============================================================================
// Heat Overlay Manager — Renders heat/halo overlays for recent write activity
//
// Sits between labels (zIndex 10) and fog (zIndex 40) at zIndex 39 so heat
// glows are visible on the map but beneath the fog-of-war layer.
//
// Heat entries decay over HEAT_DECAY_MS (10 s). Multiple writes to the same
// building stack additively (clamped to MAX_INTENSITY). Visual updates are
// throttled to UPDATE_INTERVAL_MS to avoid per-frame redraws.
// ============================================================================

import { Container, Graphics } from 'pixi.js'
import { useUniverseStore } from '../stores/universeStore'
import { useEventStore } from '../stores/eventStore'

const TILE_SIZE = 32
const CHUNK_SIZE = 64

/** Time window for heat decay (ms) */
export const HEAT_DECAY_MS = 10_000
/** Maximum heat intensity (0-1) */
export const MAX_INTENSITY = 0.6
/** Update interval to avoid per-frame redraws */
const UPDATE_INTERVAL_MS = 500

// ---------------------------------------------------------------------------
// Pure data layer (testable without PixiJS)
// ---------------------------------------------------------------------------

export interface HeatEntry {
  buildingId: string
  timestamp: number
  intensity: number
}

/** Compute faded intensity for an entry given current time */
export function fadedIntensity(entry: HeatEntry, now: number): number {
  const age = now - entry.timestamp
  if (age >= HEAT_DECAY_MS) return 0
  return entry.intensity * (1 - age / HEAT_DECAY_MS)
}

/** Prune entries older than the decay window */
export function pruneEntries(entries: HeatEntry[], now: number): HeatEntry[] {
  return entries.filter((e) => now - e.timestamp < HEAT_DECAY_MS)
}

/** Aggregate heat per building — returns Map<buildingId, intensity> */
export function aggregateHeat(
  entries: HeatEntry[],
  now: number,
): Map<string, number> {
  const buildingHeat = new Map<string, number>()
  for (const entry of entries) {
    const faded = fadedIntensity(entry, now)
    if (faded <= 0) continue
    const current = buildingHeat.get(entry.buildingId) ?? 0
    buildingHeat.set(
      entry.buildingId,
      Math.min(MAX_INTENSITY, current + faded * 0.3),
    )
  }
  return buildingHeat
}

// ---------------------------------------------------------------------------
// PixiJS renderer
// ---------------------------------------------------------------------------

export class HeatOverlayManager {
  container: Container
  private heatGraphics: Graphics
  private heatEntries: HeatEntry[] = []
  private lastUpdateTime = 0
  private lastEventCount = 0

  constructor() {
    this.container = new Container()
    this.container.label = 'heat-overlay'
    this.container.eventMode = 'none'
    this.container.interactiveChildren = false

    this.heatGraphics = new Graphics()
    this.container.addChild(this.heatGraphics)
  }

  /** Record a write event for heat tracking */
  recordWrite(buildingId: string): void {
    this.heatEntries.push({
      buildingId,
      timestamp: Date.now(),
      intensity: 1.0,
    })
  }

  update(): void {
    const now = Date.now()

    // Check for new events from the event store
    const events = useEventStore.getState().eventLog
    // Guard against cursor desync when maxLogSize trims the array
    if (events.length < this.lastEventCount) {
      this.lastEventCount = 0
    }
    if (events.length > this.lastEventCount) {
      for (let i = this.lastEventCount; i < events.length; i++) {
        const ev = events[i]?.event
        if (ev?.type === 'tool_use' && ev.target?.building_id) {
          this.recordWrite(ev.target.building_id)
        }
      }
      this.lastEventCount = events.length
    }

    // Throttle visual updates
    if (now - this.lastUpdateTime < UPDATE_INTERVAL_MS) return
    this.lastUpdateTime = now

    // Prune expired entries
    this.heatEntries = pruneEntries(this.heatEntries, now)

    if (this.heatEntries.length === 0) {
      this.heatGraphics.clear()
      return
    }

    // Aggregate heat per building
    const buildingHeat = aggregateHeat(this.heatEntries, now)

    // Render heat halos
    this.heatGraphics.clear()
    const { buildings } = useUniverseStore.getState()

    for (const [buildingId, intensity] of buildingHeat) {
      const building = buildings.get(buildingId)
      if (!building) continue

      const px =
        (building.position.chunk_x * CHUNK_SIZE + building.position.local_x) *
        TILE_SIZE
      const py =
        (building.position.chunk_y * CHUNK_SIZE + building.position.local_y) *
        TILE_SIZE
      const w = building.footprint.width * TILE_SIZE
      const h = building.footprint.height * TILE_SIZE

      // Outer warm glow
      const alpha = intensity * 0.4
      this.heatGraphics.rect(px - 4, py - 4, w + 8, h + 8)
      this.heatGraphics.fill({ color: 0xff6b35, alpha })

      // Inner brighter core
      this.heatGraphics.rect(px, py, w, h)
      this.heatGraphics.fill({ color: 0xffaa00, alpha: alpha * 0.5 })
    }
  }

  /** Clear all heat state so overlays don't bleed across scenario loads */
  reset(): void {
    this.heatEntries = []
    this.lastEventCount = 0
    this.heatGraphics.clear()
  }

  destroy(): void {
    this.heatGraphics.destroy()
    this.container.destroy({ children: true })
  }
}
