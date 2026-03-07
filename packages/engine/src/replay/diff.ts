// ============================================================================
// V4 Replay Diff Contracts — Worker → Main thread messages
// ============================================================================

import type { AgentEvent } from '@multiverse/shared'

// ---------------------------------------------------------------------------
// Diff change types — minimal messages from worker → renderer
// ---------------------------------------------------------------------------

export type DiffChange =
  | { type: 'agent_move'; id: string; x: number; y: number }
  | { type: 'building_stats'; id: string; file_count: number; health: number }
  | { type: 'tile_create'; id: string; building_id: string; file_name: string; x: number; y: number }
  | { type: 'fx'; fx: 'tool_pulse' | 'heat' | 'highlight'; target_id: string; color?: number }
  | { type: 'log'; event: AgentEvent }
  | { type: 'telemetry'; frameTimeP95: number; diffRate: number; heapEstimate: number; eventThroughput: number }

// ---------------------------------------------------------------------------
// Envelope — one message per send window
// ---------------------------------------------------------------------------

export type DiffEnvelope = {
  seq: number
  changes: DiffChange[]
  /** Raw events for event log / store dispatch (transition period) */
  events?: AgentEvent[]
  /** Combined progress so we don't need a separate message */
  progress?: { current: number; total: number }
}

// ---------------------------------------------------------------------------
// Snapshot data for worker initialization (building/agent positions)
// ---------------------------------------------------------------------------

export interface WorkerBuildingData {
  id: string
  x: number
  y: number
  file_count: number
  health: number
}

export interface WorkerAgentData {
  id: string
  x: number
  y: number
}

export interface WorkerTileData {
  id: string
  building_id: string
  state: string
}

// ---------------------------------------------------------------------------
// Worker messages
// ---------------------------------------------------------------------------

export type ReplayWorkerInMessage =
  | { type: 'load'; totalEvents: number }
  | { type: 'load_events_chunk'; chunk: AgentEvent[] }
  | { type: 'load_snapshot'; buildings: WorkerBuildingData[]; agents: WorkerAgentData[]; tiles?: WorkerTileData[] }
  | { type: 'init_sab'; buffer: SharedArrayBuffer }
  | { type: 'start'; speed?: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'restart' }
  | { type: 'set_speed'; speed: number }
  | { type: 'set_visibility'; hidden: boolean }

export type ReplayWorkerOutMessage =
  | { type: 'progress'; current: number; total: number }
  | { type: 'diff'; payload: DiffEnvelope }
  | { type: 'ready' }
  | { type: 'error'; message: string }
