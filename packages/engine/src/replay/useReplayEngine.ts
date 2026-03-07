// ============================================================================
// useReplayEngine — React hook adapter for the replay engine
//
// V4: Forwards typed diffs to WorldRenderer + still processes events via stores.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScenarioData } from '@multiverse/shared'
import { ReplayEngine, type ReplayEngineState } from './engine'
import { useEventStore } from '../stores/eventStore'
import { useUniverseStore } from '../stores/universeStore'
import { useAgentStore } from '../stores/agentStore'
import { bootstrapReplay } from './bootstrap'
import type { ReplayWorkerOutMessage, DiffChange, WorkerBuildingData, WorkerAgentData } from './diff'
import { chunk, DiffCoalescer, canUseSAB, SABRingBuffer, decodeJSON } from './transport'

// ---------------------------------------------------------------------------
// Types for renderer integration
// ---------------------------------------------------------------------------

/** Interface for WorldRenderer diff consumer (avoids circular dep) */
export interface DiffConsumer {
  applyDiffs(changes: DiffChange[]): void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const INITIAL_STATE: ReplayEngineState = {
  playbackState: 'idle',
  speed: 1,
  currentEventIndex: 0,
  totalEvents: 0,
  progress: 0,
}

const TILE_SIZE = 32
const CHUNK_SIZE = 64

export function useReplayEngine() {
  const [state, setState] = useState<ReplayEngineState>(INITIAL_STATE)
  const engineRef = useRef<ReplayEngine | null>(null)
  const scenarioRef = useRef<ScenarioData | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const rendererRef = useRef<DiffConsumer | null>(null)
  const coalescerRef = useRef(new DiffCoalescer())
  /** V4: RAF handle for batched diff flush — coalesces across multiple worker messages */
  const rafRef = useRef<number>(0)
  /** V4: Pending events accumulated between RAF flushes */
  const pendingEventsRef = useRef<import('@multiverse/shared').AgentEvent[]>([])
  const sabRef = useRef<SABRingBuffer | null>(null)
  /** Generation counter — incremented on restart/load to discard stale worker messages */
  const genRef = useRef(0)

  const isV4Replay = typeof window !== 'undefined'
    ? (window as any).__MV_V4_REPLAY__ ?? (window as any).__NEXT_PUBLIC_V4_REPLAY__ ?? true
    : false

  /** Set the renderer ref for diff forwarding */
  const setRenderer = useCallback((renderer: DiffConsumer | null) => {
    rendererRef.current = renderer
  }, [])

  // Initialize engine once
  useEffect(() => {
    if (isV4Replay) {
      // Worker-driven path
      // Visibility backoff
      const onVis = () => {
        const hidden = typeof document !== 'undefined' && document.hidden
        try { workerRef.current?.postMessage({ type: 'set_visibility', hidden }) } catch {}
      }
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVis)
      }
      return () => {
        workerRef.current?.terminate()
        workerRef.current = null
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
        pendingEventsRef.current = []
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVis)
        }
      }
    } else {
      // Legacy main-thread engine
      const engine = new ReplayEngine({
        onEvent: (event) => {
          useEventStore.getState().processEvent(event)
        },
        onStateChange: (newState) => {
          setState({ ...newState })
        },
      })
      engineRef.current = engine
      return () => engine.dispose()
    }
  }, [isV4Replay])

  /** Load a scenario: bootstrap stores + load events into engine */
  const loadScenario = useCallback((scenario: ScenarioData) => {
    genRef.current++
    bootstrapReplay(scenario)
    if (isV4Replay) {
      // Create worker once per scenario
      try { workerRef.current?.terminate() } catch {}
      coalescerRef.current.clear()
      try {
        const worker = new Worker(new URL('../modes/transcript/replay.worker.ts', import.meta.url), { type: 'module' })
        workerRef.current = worker
        // Progress / diff handler
        worker.onmessage = (ev: MessageEvent) => {
          const msg = ev.data as ReplayWorkerOutMessage
          switch (msg.type) {
            case 'ready': {
              // Optional SAB ring buffer for diffs
              if (canUseSAB()) {
                try {
                  const ring = new SABRingBuffer(4 * 1024 * 1024)
                  sabRef.current = ring
                  workerRef.current?.postMessage({ type: 'init_sab', buffer: ring.buffer })
                } catch {
                  sabRef.current = null
                }
              }
              // Send snapshot data so worker can produce typed diffs
              sendSnapshotToWorker(worker)
              // Start playback automatically once loaded
              workerRef.current?.postMessage({ type: 'start', speed: 1 })
              setState((s) => ({ ...s, playbackState: 'playing', speed: 1, totalEvents: scenario.events.length }))
              break
            }
            case 'progress': {
              const nextIndex = msg.current
              const total = msg.total
              setState((prev) => ({
                ...prev,
                currentEventIndex: nextIndex,
                totalEvents: total,
                progress: total > 0 ? nextIndex / total : 0,
                playbackState: nextIndex >= total ? 'complete' : (prev.playbackState === 'idle' ? 'playing' : prev.playbackState),
              }))
              break
            }
            case 'diff': {
              const payload = msg.payload

              // V4: Accumulate diffs — coalescer merges across multiple messages.
              // Flush on RAF to batch all diffs received within a frame.
              if (payload.changes && payload.changes.length > 0) {
                coalescerRef.current.addAll(payload.changes)
              }

              // Accumulate events for batched store dispatch
              if (payload.events && payload.events.length) {
                const pending = pendingEventsRef.current
                for (const e of payload.events) pending.push(e)
              }

              // Schedule a single RAF flush if not already pending
              if (rafRef.current === 0) {
                const expectedGen = genRef.current
                rafRef.current = requestAnimationFrame(() => {
                  rafRef.current = 0

                  // Discard stale data from a previous playback generation
                  if (expectedGen !== genRef.current) {
                    coalescerRef.current.clear()
                    pendingEventsRef.current = []
                    return
                  }

                  // If SAB is active, drain ring first
                  const ring = sabRef.current
                  if (ring) {
                    let frame: Uint8Array | null
                    // Drain all available frames for this animation frame
                    while ((frame = ring.read()) !== null) {
                      const msg = decodeJSON(frame!) as { type: string; payload: any }
                      if (msg && msg.type === 'diff' && msg.payload) {
                        const payload = msg.payload as { changes?: DiffChange[]; events?: import('@multiverse/shared').AgentEvent[]; progress?: { current: number; total: number } }
                        if (payload.changes && payload.changes.length > 0) {
                          coalescerRef.current.addAll(payload.changes)
                        }
                        if (payload.events && payload.events.length) {
                          const pending = pendingEventsRef.current
                          for (const e of payload.events) pending.push(e)
                        }
                        if (payload.progress) {
                          const { current, total } = payload.progress
                          setState((prev) => ({
                            ...prev,
                            currentEventIndex: current,
                            totalEvents: total,
                            progress: total > 0 ? current / total : 0,
                            playbackState: current >= total ? 'complete' : (prev.playbackState === 'idle' ? 'playing' : prev.playbackState),
                          }))
                        }
                      }
                    }
                  }

                  // Flush coalesced diffs to renderer
                  const merged = coalescerRef.current.flush()
                  if (merged.length > 0 && rendererRef.current) {
                    rendererRef.current.applyDiffs(merged)
                  }

                  // Flush accumulated events to stores
                  const events = pendingEventsRef.current
                  if (events.length > 0) {
                    const proc = useEventStore.getState().processEvent
                    for (let i = 0; i < events.length; i++) proc(events[i]!)
                    pendingEventsRef.current = []
                  }
                })
              }

              // Update progress from combined envelope
              if (payload.progress) {
                const { current, total } = payload.progress
                setState((prev) => ({
                  ...prev,
                  currentEventIndex: current,
                  totalEvents: total,
                  progress: total > 0 ? current / total : 0,
                  playbackState: current >= total ? 'complete' : (prev.playbackState === 'idle' ? 'playing' : prev.playbackState),
                }))
              }
              break
            }
            case 'error':
              // eslint-disable-next-line no-console
              console.warn('[replay-worker] error:', msg.message)
              break
            default:
              break
          }
        }
        // Load events in chunks to avoid huge postMessage
        const events = scenario.events
        const CHUNK = 5000
        worker.postMessage({ type: 'load', totalEvents: events.length })
        for (const c of chunk(events, CHUNK)) {
          worker.postMessage({ type: 'load_events_chunk', chunk: c })
        }

        // Send snapshot-derived geometry to initialize typed diff state in worker
        try {
          const bld: WorkerBuildingData[] = scenario.snapshot.buildings.map((b) => {
            const px = (b.position.chunk_x * CHUNK_SIZE + b.position.local_x) * TILE_SIZE
            const py = (b.position.chunk_y * CHUNK_SIZE + b.position.local_y) * TILE_SIZE
            return { id: b.id, x: px, y: py, file_count: b.file_count, health: b.health }
          })
          const ag: WorkerAgentData[] = scenario.snapshot.agents.map((a) => {
            const px = (a.position.chunk_x * CHUNK_SIZE + a.position.local_x) * TILE_SIZE
            const py = (a.position.chunk_y * CHUNK_SIZE + a.position.local_y) * TILE_SIZE
            return { id: a.id, x: px, y: py }
          }) as WorkerAgentData[]
          // Send baseline tiles so worker knows which tiles exist at t=0
          const tl = scenario.snapshot.tiles.map((t) => ({
            id: t.id,
            building_id: t.building_id,
            state: t.state,
          }))
          worker.postMessage({ type: 'load_snapshot', buildings: bld, agents: ag, tiles: tl })
        } catch {
          // If snapshot incomplete, skip — diff path still functions with events only
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[replay] worker unavailable, falling back to main-thread', err)
        engineRef.current?.load(scenario.events)
      }
    } else {
      engineRef.current?.load(scenario.events)
    }
    // Store only snapshot for restart — engine/worker holds events
    scenarioRef.current = { ...scenario, events: [] }
  }, [isV4Replay])

  const play = useCallback(() => {
    if (isV4Replay) {
      workerRef.current?.postMessage({ type: 'play' })
      setState((s) => ({ ...s, playbackState: 'playing' }))
    } else {
      engineRef.current?.play()
    }
  }, [isV4Replay])

  const pause = useCallback(() => {
    if (isV4Replay) {
      workerRef.current?.postMessage({ type: 'pause' })
      setState((s) => ({ ...s, playbackState: 'paused' }))
    } else {
      engineRef.current?.pause()
    }
  }, [isV4Replay])

  /** Restart: re-bootstrap stores from stored scenario and restart engine */
  const restart = useCallback(() => {
    const scenario = scenarioRef.current
    if (!scenario) return
    genRef.current++
    bootstrapReplay(scenario)
    coalescerRef.current.clear()
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    pendingEventsRef.current = []
    if (isV4Replay) {
      workerRef.current?.postMessage({ type: 'restart' })
      setState((s) => ({ ...s, playbackState: 'idle', currentEventIndex: 0, progress: 0 }))
    } else {
      engineRef.current?.restart()
    }
  }, [isV4Replay])

  const stepForward = useCallback(() => {
    if (isV4Replay) {
      // In worker path we don't support manual single-step; approximate by pausing and briefly playing one tick
      workerRef.current?.postMessage({ type: 'pause' })
      // eslint-disable-next-line no-console
      console.info('[replay] stepForward not supported in worker mode; use play/pause')
    } else {
      engineRef.current?.stepForward()
    }
  }, [isV4Replay])

  const setSpeed = useCallback((speed: number) => {
    if (isV4Replay) {
      workerRef.current?.postMessage({ type: 'set_speed', speed })
      setState((s) => ({ ...s, speed }))
    } else {
      engineRef.current?.setSpeed(speed)
    }
  }, [isV4Replay])

  return {
    ...state,
    loadScenario,
    play,
    pause,
    restart,
    stepForward,
    setSpeed,
    setRenderer,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract building + agent positions from stores and send to worker */
function sendSnapshotToWorker(worker: Worker): void {
  const buildings = useUniverseStore.getState().buildings
  const buildingData = Array.from(buildings.values()).map(b => ({
    id: b.id,
    x: (b.position.chunk_x * CHUNK_SIZE + b.position.local_x) * TILE_SIZE,
    y: (b.position.chunk_y * CHUNK_SIZE + b.position.local_y) * TILE_SIZE,
    file_count: b.file_count,
    health: b.health,
  }))
  const agents = useAgentStore.getState().agents
  const agentData = Array.from(agents.values()).map(a => ({
    id: a.id,
    x: (a.position.chunk_x * CHUNK_SIZE + a.position.local_x) * TILE_SIZE,
    y: (a.position.chunk_y * CHUNK_SIZE + a.position.local_y) * TILE_SIZE,
  }))
  // Send baseline tiles so worker knows which tiles exist at t=0
  const tiles = useUniverseStore.getState().tiles
  const tileData = Array.from(tiles.values()).map(t => ({
    id: t.id,
    building_id: t.building_id,
    state: t.state,
  }))
  worker.postMessage({ type: 'load_snapshot', buildings: buildingData, agents: agentData, tiles: tileData })
}
