// ============================================================================
// Replay Engine — Play/Pause/Step/Speed/Clamping/Progress (hq-gij.4)
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReplayEngine } from '../replay/engine'
import type { ReplayEngineState, ReplayEngineCallbacks } from '../replay/engine'
import type { AgentEvent } from '@multiverse/shared'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(index: number, ts = 1000 + index * 100): AgentEvent {
  return {
    id: `evt_${index}`,
    schema_version: 1,
    dedupe_key: `mock:${index}`,
    agent_id: 'actor_main',
    planet_id: 'world_test',
    seq: index,
    timestamp: ts,
    kind: 'mutation',
    type: 'file_edit',
    source: 'mock',
    metadata: {},
  }
}

function makeEvents(count: number): AgentEvent[] {
  return Array.from({ length: count }, (_, i) => makeEvent(i))
}

interface TestHarness {
  engine: ReplayEngine
  events: AgentEvent[]
  stateHistory: ReplayEngineState[]
  dispatchedEvents: AgentEvent[]
}

function createHarness(eventCount = 5): TestHarness {
  const stateHistory: ReplayEngineState[] = []
  const dispatchedEvents: AgentEvent[] = []

  const callbacks: ReplayEngineCallbacks = {
    onEvent: (event) => dispatchedEvents.push(event),
    onStateChange: (state) => stateHistory.push({ ...state }),
  }

  const engine = new ReplayEngine(callbacks)
  const events = makeEvents(eventCount)

  return { engine, events, stateHistory, dispatchedEvents }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReplayEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- Load ----

  describe('load', () => {
    it('sets state to idle with correct totalEvents', () => {
      const { engine, events, stateHistory } = createHarness()
      engine.load(events)

      const lastState = stateHistory[stateHistory.length - 1]!
      expect(lastState.playbackState).toBe('idle')
      expect(lastState.totalEvents).toBe(5)
      expect(lastState.currentEventIndex).toBe(0)
      expect(lastState.progress).toBe(0)
    })

    it('resets to beginning on second load', () => {
      const { engine, events, stateHistory } = createHarness()
      engine.load(events)
      engine.play()
      vi.advanceTimersByTime(500)
      engine.load(makeEvents(3))

      const lastState = stateHistory[stateHistory.length - 1]!
      expect(lastState.playbackState).toBe('idle')
      expect(lastState.totalEvents).toBe(3)
      expect(lastState.currentEventIndex).toBe(0)
    })

    it('preserves speed across loads', () => {
      const { engine, events, stateHistory } = createHarness()
      engine.load(events)
      engine.setSpeed(3)
      engine.load(makeEvents(2))

      const lastState = stateHistory[stateHistory.length - 1]!
      expect(lastState.speed).toBe(3)
    })
  })

  // ---- Play ----

  describe('play', () => {
    it('dispatches first event immediately', () => {
      const { engine, events, dispatchedEvents } = createHarness()
      engine.load(events)
      engine.play()

      expect(dispatchedEvents.length).toBe(1)
      expect(dispatchedEvents[0]!.id).toBe('evt_0')
    })

    it('transitions to playing state', () => {
      const { engine, events, stateHistory } = createHarness()
      engine.load(events)
      engine.play()

      const playingStates = stateHistory.filter(s => s.playbackState === 'playing')
      expect(playingStates.length).toBeGreaterThan(0)
    })

    it('dispatches subsequent events after timer delays', () => {
      const { engine, events, dispatchedEvents } = createHarness()
      engine.load(events)
      engine.play()

      // First event dispatched immediately
      expect(dispatchedEvents.length).toBe(1)

      // Advance timer past the clamped delay (min 80ms)
      vi.advanceTimersByTime(100)
      expect(dispatchedEvents.length).toBe(2)

      vi.advanceTimersByTime(100)
      expect(dispatchedEvents.length).toBe(3)
    })

    it('completes after all events dispatched', () => {
      const { engine, events, stateHistory } = createHarness(3)
      engine.load(events)
      engine.play()

      // Advance enough for all events
      vi.advanceTimersByTime(10000)

      const lastState = stateHistory[stateHistory.length - 1]!
      expect(lastState.playbackState).toBe('complete')
      expect(lastState.progress).toBe(1)
    })

    it('does nothing when already complete', () => {
      const { engine, events, stateHistory } = createHarness(2)
      engine.load(events)
      engine.play()
      vi.advanceTimersByTime(10000)

      const completeCount = stateHistory.filter(s => s.playbackState === 'complete').length
      engine.play() // should be a no-op

      // No new complete state emitted after play() on complete
      const newCompleteCount = stateHistory.filter(s => s.playbackState === 'complete').length
      expect(newCompleteCount).toBe(completeCount)
    })
  })

  // ---- Pause ----

  describe('pause', () => {
    it('stops playback', () => {
      const { engine, events, dispatchedEvents } = createHarness()
      engine.load(events)
      engine.play()

      const countBefore = dispatchedEvents.length
      engine.pause()

      // Advance timer — no more events should be dispatched
      vi.advanceTimersByTime(10000)
      expect(dispatchedEvents.length).toBe(countBefore)
    })

    it('transitions to paused state', () => {
      const { engine, events, stateHistory } = createHarness()
      engine.load(events)
      engine.play()
      engine.pause()

      const lastState = stateHistory[stateHistory.length - 1]!
      expect(lastState.playbackState).toBe('paused')
    })

    it('can resume after pause', () => {
      const { engine, events, dispatchedEvents } = createHarness()
      engine.load(events)
      engine.play()
      engine.pause()

      const countAfterPause = dispatchedEvents.length
      engine.play()

      // Should dispatch next event
      expect(dispatchedEvents.length).toBeGreaterThan(countAfterPause)
    })
  })

  // ---- Step Forward ----

  describe('stepForward', () => {
    it('dispatches exactly one event', () => {
      const { engine, events, dispatchedEvents } = createHarness()
      engine.load(events)
      engine.stepForward()

      expect(dispatchedEvents.length).toBe(1)
      expect(dispatchedEvents[0]!.id).toBe('evt_0')
    })

    it('advances event index by 1', () => {
      const { engine, events, stateHistory } = createHarness()
      engine.load(events)
      engine.stepForward()

      const lastState = stateHistory[stateHistory.length - 1]!
      expect(lastState.currentEventIndex).toBe(1)
    })

    it('transitions to paused after step (not playing)', () => {
      const { engine, events, stateHistory } = createHarness()
      engine.load(events)
      engine.stepForward()

      const lastState = stateHistory[stateHistory.length - 1]!
      expect(lastState.playbackState).toBe('paused')
    })

    it('transitions to complete on last event', () => {
      const { engine, events, stateHistory } = createHarness(2)
      engine.load(events)
      engine.stepForward()
      engine.stepForward()

      const lastState = stateHistory[stateHistory.length - 1]!
      expect(lastState.playbackState).toBe('complete')
    })

    it('does nothing when at end', () => {
      const { engine, events, dispatchedEvents } = createHarness(1)
      engine.load(events)
      engine.stepForward()
      engine.stepForward() // should be a no-op

      expect(dispatchedEvents.length).toBe(1)
    })

    it('updates progress correctly', () => {
      const { engine, events, stateHistory } = createHarness(4)
      engine.load(events)

      engine.stepForward()
      expect(stateHistory[stateHistory.length - 1]!.progress).toBeCloseTo(0.25, 2)

      engine.stepForward()
      expect(stateHistory[stateHistory.length - 1]!.progress).toBeCloseTo(0.5, 2)

      engine.stepForward()
      expect(stateHistory[stateHistory.length - 1]!.progress).toBeCloseTo(0.75, 2)

      engine.stepForward()
      expect(stateHistory[stateHistory.length - 1]!.progress).toBeCloseTo(1, 2)
    })
  })

  // ---- Restart ----

  describe('restart', () => {
    it('resets to beginning', () => {
      const { engine, events, stateHistory } = createHarness()
      engine.load(events)
      engine.play()
      vi.advanceTimersByTime(500)
      engine.restart()

      const lastState = stateHistory[stateHistory.length - 1]!
      expect(lastState.playbackState).toBe('idle')
      expect(lastState.currentEventIndex).toBe(0)
      expect(lastState.progress).toBe(0)
    })

    it('clears pending timers', () => {
      const { engine, events, dispatchedEvents } = createHarness()
      engine.load(events)
      engine.play()
      engine.restart()

      const countAfterRestart = dispatchedEvents.length
      vi.advanceTimersByTime(10000)
      expect(dispatchedEvents.length).toBe(countAfterRestart)
    })
  })

  // ---- Speed ----

  describe('setSpeed', () => {
    it('updates speed in state', () => {
      const { engine, events, stateHistory } = createHarness()
      engine.load(events)
      engine.setSpeed(2)

      expect(stateHistory[stateHistory.length - 1]!.speed).toBe(2)
    })

    it('affects delay between events', () => {
      // At speed 1, delay between events with 100ms gap = max(80, min(100/1, 5000)) = 100ms
      // At speed 2, delay = max(80, min(100/2, 5000)) = 80ms (clamped to min)
      const h1 = createHarness()
      h1.engine.load(h1.events)
      h1.engine.setSpeed(1)
      h1.engine.play()

      const h2 = createHarness()
      h2.engine.load(h2.events)
      h2.engine.setSpeed(10) // very fast
      h2.engine.play()

      // At speed 10, delay = max(80, min(100/10, 5000)) = 80ms (minimum)
      vi.advanceTimersByTime(80)

      // Both should have dispatched at least 2 events by now
      expect(h2.dispatchedEvents.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ---- Timestamp Clamping ----

  describe('timestamp clamping', () => {
    it('clamps minimum delay to 80ms', () => {
      const events = [makeEvent(0, 1000), makeEvent(1, 1001)] // 1ms gap
      const { engine, dispatchedEvents } = createHarness()
      engine.load(events)
      engine.play()

      // First event dispatched immediately
      expect(dispatchedEvents.length).toBe(1)

      // At 79ms, second should NOT be dispatched
      vi.advanceTimersByTime(79)
      expect(dispatchedEvents.length).toBe(1)

      // At 80ms+, second should be dispatched
      vi.advanceTimersByTime(2)
      expect(dispatchedEvents.length).toBe(2)
    })

    it('clamps maximum delay to 5000ms', () => {
      const events = [makeEvent(0, 0), makeEvent(1, 1_000_000)] // huge gap
      const { engine, dispatchedEvents } = createHarness()
      engine.load(events)
      engine.play()

      expect(dispatchedEvents.length).toBe(1)

      // At 5000ms, should dispatch despite large timestamp gap
      vi.advanceTimersByTime(5001)
      expect(dispatchedEvents.length).toBe(2)
    })
  })

  // ---- Progress Accuracy ----

  describe('progress accuracy', () => {
    it('progress equals currentEventIndex / totalEvents', () => {
      const { engine, events, stateHistory } = createHarness(10)
      engine.load(events)

      for (let i = 0; i < 10; i++) {
        engine.stepForward()
        const state = stateHistory[stateHistory.length - 1]!
        expect(state.progress).toBeCloseTo((i + 1) / 10, 5)
      }
    })

    it('progress is 0 at start', () => {
      const { engine, events, stateHistory } = createHarness()
      engine.load(events)
      expect(stateHistory[stateHistory.length - 1]!.progress).toBe(0)
    })

    it('progress is 1 at complete', () => {
      const { engine, events, stateHistory } = createHarness(3)
      engine.load(events)
      engine.play()
      vi.advanceTimersByTime(100_000)

      expect(stateHistory[stateHistory.length - 1]!.progress).toBe(1)
    })
  })

  // ---- Event ordering ----

  describe('event ordering', () => {
    it('dispatches events in sequential order', () => {
      const { engine, events, dispatchedEvents } = createHarness(5)
      engine.load(events)

      for (let i = 0; i < 5; i++) {
        engine.stepForward()
      }

      for (let i = 0; i < 5; i++) {
        expect(dispatchedEvents[i]!.id).toBe(`evt_${i}`)
      }
    })

    it('preserves order during continuous playback', () => {
      const { engine, events, dispatchedEvents } = createHarness(5)
      engine.load(events)
      engine.play()
      vi.advanceTimersByTime(100_000)

      for (let i = 0; i < 5; i++) {
        expect(dispatchedEvents[i]!.seq).toBe(i)
      }
    })
  })

  // ---- getState ----

  describe('getState', () => {
    it('returns a copy of current state', () => {
      const { engine, events } = createHarness()
      engine.load(events)

      const state = engine.getState()
      expect(state.playbackState).toBe('idle')
      expect(state.totalEvents).toBe(5)

      // Mutating the returned state shouldn't affect the engine
      state.totalEvents = 999
      expect(engine.getState().totalEvents).toBe(5)
    })
  })

  // ---- dispose ----

  describe('dispose', () => {
    it('clears all timers', () => {
      const { engine, events, dispatchedEvents } = createHarness()
      engine.load(events)
      engine.play()
      engine.dispose()

      const count = dispatchedEvents.length
      vi.advanceTimersByTime(100_000)
      expect(dispatchedEvents.length).toBe(count)
    })
  })

  // ---- Error handling ----

  describe('error handling', () => {
    it('continues playback when onEvent throws', () => {
      const stateHistory: ReplayEngineState[] = []
      let callCount = 0

      const engine = new ReplayEngine({
        onEvent: () => {
          callCount++
          if (callCount === 1) throw new Error('boom')
        },
        onStateChange: (state) => stateHistory.push({ ...state }),
      })

      engine.load(makeEvents(3))
      engine.play()
      vi.advanceTimersByTime(10000)

      // Should have tried all 3 events despite first throwing
      expect(callCount).toBe(3)
      expect(stateHistory[stateHistory.length - 1]!.playbackState).toBe('complete')
    })
  })

  // ---- Empty events ----

  describe('empty events', () => {
    it('handles load with empty array', () => {
      const { engine, stateHistory } = createHarness()
      engine.load([])

      expect(stateHistory[stateHistory.length - 1]!.totalEvents).toBe(0)
      expect(stateHistory[stateHistory.length - 1]!.progress).toBe(0)
    })

    it('play on empty events goes to complete', () => {
      const { engine, stateHistory } = createHarness()
      engine.load([])
      engine.play()

      expect(stateHistory[stateHistory.length - 1]!.playbackState).toBe('complete')
    })
  })
})
