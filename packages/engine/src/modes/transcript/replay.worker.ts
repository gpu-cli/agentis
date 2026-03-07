/// <reference lib="webworker" />
// ============================================================================
// V4 Replay Worker — Fixed-step scheduler, diff producer, telemetry
//
// Produces typed diffs (agent_move, building_stats, fx) alongside raw events.
// Uses LWW coalescing within each send window.
// ============================================================================

import type { AgentEvent } from '@multiverse/shared'
import type {
  ReplayWorkerInMessage,
  ReplayWorkerOutMessage,
  DiffEnvelope,
} from '../../replay/diff'
import { DiffCoalescer, SABRingBuffer, writeDiffToSAB } from '../../replay/transport'

const ctx = self as unknown as DedicatedWorkerGlobalScope

// ---------------------------------------------------------------------------
// Event state
// ---------------------------------------------------------------------------

let loadedEvents: AgentEvent[] = []
let totalEvents = 0
let currentIndex = 0
let speed = 1
let running = false
let hidden = false
let baseTime = 0
let simTime = 0
let sendSeq = 0

// ---------------------------------------------------------------------------
// SoA state — minimal typed arrays for diff production
// ---------------------------------------------------------------------------

/** Building stats tracked in worker for diff production */
const buildingStats = new Map<string, { file_count: number; health: number; totalTiles: number; completeTiles: number }>()

/** Building pixel positions (immutable after snapshot load) */
const buildingPositions = new Map<string, { x: number; y: number }>()

/** Agent last-known pixel positions */
const agentPositions = new Map<string, { x: number; y: number }>()

/** Map from tile_id → building_id for health recalc */
const tileBuildingMap = new Map<string, string>()

/** Tile states for health computation */
const tileStates = new Map<string, string>()

// ---------------------------------------------------------------------------
// Diff coalescer — LWW merge within each send window
// ---------------------------------------------------------------------------

const coalescer = new DiffCoalescer()

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

let eventsProcessedThisSecond = 0
let lastTelemetryAt = 0
let tickDurations: number[] = []
const TELEMETRY_INTERVAL_MS = 1000

// ---------------------------------------------------------------------------
// Loop timing
// ---------------------------------------------------------------------------

const FIXED_DT_MS = 16.6667
const MAX_STEPS_PER_TICK = 5
const SEND_HZ = 20 // 20Hz diff stream
const SEND_INTERVAL_MS = 1000 / SEND_HZ
let lastSendAt = 0
let sabRing: SABRingBuffer | null = null
let sabActive = false

function post(msg: ReplayWorkerOutMessage) {
  ctx.postMessage(msg)
}

function resetState() {
  currentIndex = 0
  simTime = 0
  baseTime = loadedEvents.length > 0 ? loadedEvents[0]!.timestamp : 0
  sendSeq = 0
  lastSendAt = 0
  coalescer.clear()
  eventsProcessedThisSecond = 0
  lastTelemetryAt = 0
  tickDurations = []
}

// ---------------------------------------------------------------------------
// Event → Diff production
// ---------------------------------------------------------------------------

function processEventForDiffs(event: AgentEvent): void {
  switch (event.type) {
    case 'move': {
      const buildingId = event.target?.building_id
      if (buildingId) {
        const bpos = buildingPositions.get(buildingId)
        if (bpos) {
          agentPositions.set(event.agent_id, { x: bpos.x, y: bpos.y })
          coalescer.add({
            type: 'agent_move',
            id: event.agent_id,
            x: bpos.x,
            y: bpos.y,
          })
        }
      }
      break
    }

    case 'file_create': {
      const buildingId = event.target?.building_id
      const tileId = event.target?.tile_id
      if (buildingId && tileId) {
        tileBuildingMap.set(tileId, buildingId)
        tileStates.set(tileId, 'scaffolding')

        // Emit tile_create diff so the renderer can add the tile sprite
        const meta = event.metadata as { path?: string; local?: { x: number; y: number } }
        const fileName = meta.path?.split('/').pop() ?? tileId
        const pos = meta.local ?? { x: 0, y: 0 }
        coalescer.add({
          type: 'tile_create',
          id: tileId,
          building_id: buildingId,
          file_name: fileName,
          x: pos.x,
          y: pos.y,
        })

        recalcBuilding(buildingId)
      }
      break
    }

    case 'file_edit': {
      const tileId = event.target?.tile_id
      const buildingId = event.target?.building_id
      if (tileId) {
        // Auto-create tile in worker if not yet tracked (resilient to event ordering)
        if (!tileBuildingMap.has(tileId) && buildingId) {
          tileBuildingMap.set(tileId, buildingId)
          tileStates.set(tileId, 'scaffolding')

          const meta = event.metadata as { path?: string; local?: { x: number; y: number } }
          const fileName = meta.path?.split('/').pop() ?? tileId
          const pos = meta.local ?? { x: 0, y: 0 }
          coalescer.add({
            type: 'tile_create',
            id: tileId,
            building_id: buildingId,
            file_name: fileName,
            x: pos.x,
            y: pos.y,
          })
        }

        // Completion pass events carry state: 'complete' in metadata
        const editMeta = event.metadata as { state?: string }
        tileStates.set(tileId, editMeta.state === 'complete' ? 'complete' : 'building')
        const resolvedBuildingId = tileBuildingMap.get(tileId)
        if (resolvedBuildingId) recalcBuilding(resolvedBuildingId)
      }
      break
    }

    case 'file_delete': {
      const tileId = event.target?.tile_id
      if (tileId) {
        tileStates.set(tileId, 'ruins')
        const buildingId = tileBuildingMap.get(tileId)
        if (buildingId) recalcBuilding(buildingId)
      }
      break
    }

    case 'tool_use': {
      const buildingId = event.target?.building_id
      if (buildingId) {
        coalescer.add({
          type: 'fx',
          fx: 'tool_pulse',
          target_id: buildingId,
          color: undefined,
        })
      }
      break
    }

    default:
      break
  }
}

/** Recalculate building file_count and health, emit building_stats diff */
function recalcBuilding(buildingId: string): void {
  let totalTiles = 0
  let completeTiles = 0

  // Count all tiles for this building
  for (const [tileId, bId] of tileBuildingMap) {
    if (bId !== buildingId) continue
    totalTiles++
    const state = tileStates.get(tileId)
    if (state === 'complete' || state === 'building') {
      completeTiles++
    }
  }

  const health = totalTiles > 0 ? Math.round((completeTiles / totalTiles) * 100) : 0

  buildingStats.set(buildingId, { file_count: totalTiles, health, totalTiles, completeTiles })

  coalescer.add({
    type: 'building_stats',
    id: buildingId,
    file_count: totalTiles,
    health,
  })
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

function tick(realDeltaMs: number) {
  const tickStart = performance.now()

  // Visibility backoff: if hidden, run at ~2Hz equivalent progression
  const visibilityFactor = hidden ? 0.12 : 1
  let acc = Math.min(realDeltaMs * visibilityFactor, FIXED_DT_MS * MAX_STEPS_PER_TICK)
  let eventBatch: AgentEvent[] | null = null

  while (acc > 0) {
    const step = Math.min(acc, FIXED_DT_MS)
    acc -= step
    simTime += step * speed
    // Emit all events up to baseTime + simTime
    const cutoff = baseTime + simTime
    while (currentIndex < totalEvents && loadedEvents[currentIndex]!.timestamp <= cutoff) {
      const event = loadedEvents[currentIndex]!
      if (eventBatch === null) eventBatch = []
      eventBatch.push(event)

      // Produce typed diffs
      processEventForDiffs(event)
      eventsProcessedThisSecond++

      currentIndex++
    }
  }

  const tickEnd = performance.now()
  tickDurations.push(tickEnd - tickStart)
  // Keep only last 100 samples for p95
  if (tickDurations.length > 100) tickDurations.shift()

  const now = Date.now()

  // Force flush when stream is complete, otherwise respect send cadence
  const isComplete = currentIndex >= totalEvents
  if ((eventBatch || coalescer.size > 0) && (isComplete || now - lastSendAt >= SEND_INTERVAL_MS)) {
    lastSendAt = now

    const changes = coalescer.flush()

    // Emit telemetry at ~1Hz
    if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
      const sorted = [...tickDurations].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
      changes.push({
        type: 'telemetry',
        frameTimeP95: Math.round(p95 * 100) / 100,
        diffRate: coalescer.size,
        heapEstimate: 0, // Worker doesn't have performance.memory
        eventThroughput: eventsProcessedThisSecond,
      })
      eventsProcessedThisSecond = 0
      lastTelemetryAt = now
    }

    const payload: DiffEnvelope = {
      seq: sendSeq++,
      changes,
      events: eventBatch ?? undefined,
      progress: { current: currentIndex, total: totalEvents },
    }
    if (sabActive && sabRing) {
      // Write to SAB; if backpressured, fall back to postMessage
      if (!writeDiffToSAB(sabRing, payload)) {
        post({ type: 'diff', payload })
      }
    } else {
      post({ type: 'diff', payload })
    }
  }

  if (isComplete) running = false
}

// ---------------------------------------------------------------------------
// Main loop — use setTimeout in worker (rAF not guaranteed here)
// ---------------------------------------------------------------------------

let loopTimer: number | null = null
let lastNow = performance.now()
function startLoop() {
  if (loopTimer !== null) return
  const step = () => {
    const now = performance.now()
    const delta = now - lastNow
    lastNow = now
    if (running) {
      tick(delta)
    }
    loopTimer = (setTimeout(step, 16) as unknown) as number
  }
  lastNow = performance.now()
  step()
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

ctx.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as ReplayWorkerInMessage
  try {
    switch (msg.type) {
      case 'load': {
        loadedEvents = []
        totalEvents = msg.totalEvents
        resetState()
        post({ type: 'ready' })
        break
      }
      case 'load_events_chunk': {
        if (msg.chunk && msg.chunk.length) {
          loadedEvents.push(...msg.chunk)
          totalEvents = loadedEvents.length
        }
        break
      }
      case 'load_snapshot': {
        // Initialize SoA state from snapshot
        buildingStats.clear()
        buildingPositions.clear()
        agentPositions.clear()
        tileBuildingMap.clear()
        tileStates.clear()

        if (msg.buildings) {
          for (const b of msg.buildings) {
            buildingPositions.set(b.id, { x: b.x, y: b.y })
            buildingStats.set(b.id, {
              file_count: b.file_count,
              health: b.health,
              totalTiles: b.file_count,
              completeTiles: Math.round((b.health / 100) * b.file_count),
            })
          }
        }
        if (msg.agents) {
          for (const a of msg.agents) {
            agentPositions.set(a.id, { x: a.x, y: a.y })
          }
        }
        // Initialize baseline tile tracking from snapshot
        if (msg.tiles) {
          for (const t of msg.tiles) {
            tileBuildingMap.set(t.id, t.building_id)
            tileStates.set(t.id, t.state)
          }
        }
        break
      }
      case 'init_sab': {
        const buf = (msg as any).buffer as SharedArrayBuffer
        try {
          sabRing = new SABRingBuffer(buf)
          sabActive = true
        } catch {
          sabRing = null
          sabActive = false
        }
        break
      }
      case 'start': {
        speed = msg.speed ?? 1
        running = true
        resetState()
        startLoop()
        break
      }
      case 'play':
        running = true
        startLoop()
        break
      case 'pause':
        running = false
        break
      case 'restart':
        resetState()
        post({ type: 'progress', current: 0, total: totalEvents })
        break
      case 'set_speed':
        speed = Math.max(0.1, msg.speed)
        break
      case 'set_visibility':
        hidden = !!msg.hidden
        break
      default:
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Worker error'
    post({ type: 'error', message })
  }
}
