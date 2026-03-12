// ============================================================================
// Replay Engine — Pure playback state machine (no React, no stores)
// ============================================================================

import type { AgentEvent } from '@multiverse/shared'
import { setDispatchPlaybackSpeed } from '../stores/eventStore'

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'complete'

export interface ReplayEngineState {
  playbackState: PlaybackState
  speed: number
  currentEventIndex: number
  totalEvents: number
  progress: number
}

export interface ReplayEngineCallbacks {
  /** Called when an event should be dispatched to stores */
  onEvent: (event: AgentEvent) => void
  /** Called whenever engine state changes */
  onStateChange: (state: ReplayEngineState) => void
}

const INITIAL_STATE: ReplayEngineState = {
  playbackState: 'idle',
  speed: 1,
  currentEventIndex: 0,
  totalEvents: 0,
  progress: 0,
}

export class ReplayEngine {
  private events: AgentEvent[] = []
  private state: ReplayEngineState = { ...INITIAL_STATE }
  private callbacks: ReplayEngineCallbacks
  private timerId: ReturnType<typeof setTimeout> | null = null

  constructor(callbacks: ReplayEngineCallbacks) {
    this.callbacks = callbacks
  }

  /** Load a new set of events. Resets playback state to idle. */
  load(events: AgentEvent[]): void {
    this.clearTimer()
    this.events = events
    this.updateState({
      playbackState: 'idle',
      speed: this.state.speed, // preserve speed across loads
      currentEventIndex: 0,
      totalEvents: events.length,
      progress: 0,
    })
  }

  /** Start or resume playback */
  play(): void {
    if (this.state.playbackState === 'complete') return
    this.updateState({ playbackState: 'playing' })
    this.processNext()
  }

  /** Pause playback */
  pause(): void {
    this.clearTimer()
    this.updateState({ playbackState: 'paused' })
  }

  /** Restart from beginning (caller must re-bootstrap stores before calling) */
  restart(): void {
    this.clearTimer()
    this.updateState({
      playbackState: 'idle',
      currentEventIndex: 0,
      progress: 0,
    })
  }

  /** Step forward one event */
  stepForward(): void {
    if (this.state.currentEventIndex >= this.events.length) return

    const event = this.events[this.state.currentEventIndex]!
    try {
      this.callbacks.onEvent(event)
    } catch (err) {
      console.warn('[replay-engine] event processing error, skipping', err)
    }

    const nextIndex = this.state.currentEventIndex + 1
    this.updateState({
      currentEventIndex: nextIndex,
      progress: this.events.length > 0 ? nextIndex / this.events.length : 0,
      playbackState: nextIndex >= this.events.length ? 'complete' : 'paused',
    })
  }

  /** Set playback speed multiplier */
  setSpeed(speed: number): void {
    setDispatchPlaybackSpeed(speed)
    this.updateState({ speed })
  }

  /** Get current state snapshot */
  getState(): ReplayEngineState {
    return { ...this.state }
  }

  /** Clean up timers */
  dispose(): void {
    this.clearTimer()
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private processNext(): void {
    if (this.state.currentEventIndex >= this.events.length) {
      this.updateState({ playbackState: 'complete' })
      return
    }

    if (this.state.playbackState !== 'playing') return

    // Guard: don't double-fire
    if (this.timerId !== null) return

    const event = this.events[this.state.currentEventIndex]!
    try {
      this.callbacks.onEvent(event)
    } catch (err) {
      console.warn('[replay-engine] event processing error, skipping', err)
    }

    const nextIndex = this.state.currentEventIndex + 1
    this.updateState({
      currentEventIndex: nextIndex,
      progress: this.events.length > 0 ? nextIndex / this.events.length : 0,
    })

    // Schedule next event
    if (nextIndex < this.events.length) {
      const nextEvent = this.events[nextIndex]!
      const rawDelay = (nextEvent.timestamp - event.timestamp) / this.state.speed
      const clampedDelay = Math.max(80, Math.min(rawDelay, 5000))
      this.timerId = setTimeout(() => {
        this.timerId = null
        this.processNext()
      }, clampedDelay)
    } else {
      this.updateState({ playbackState: 'complete' })
    }
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  private updateState(partial: Partial<ReplayEngineState>): void {
    this.state = { ...this.state, ...partial }
    this.callbacks.onStateChange({ ...this.state })
  }
}
