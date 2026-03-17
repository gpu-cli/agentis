// ============================================================================
// V4 Transport Utilities — throttling, coalescing, chunk helpers
// ============================================================================

import type { AgentEvent } from '@multiverse/shared'
import type { DiffChange, DiffEnvelope } from './diff'

// ---------------------------------------------------------------------------
// Chunk helper
// ---------------------------------------------------------------------------

/** Chunk a large array into slices of size n */
export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// ---------------------------------------------------------------------------
// Throttle
// ---------------------------------------------------------------------------

/** Throttle a function to at most one call per intervalMs. Drops intermediate calls, keeps latest. */
export function throttleLatest<TArgs extends unknown[]>(fn: (...args: TArgs) => void, intervalMs: number) {
  let lastTime = 0
  let scheduled: number | null = null
  let pendingArgs: TArgs | null = null
  return (...args: TArgs) => {
    const now = Date.now()
    const elapsed = now - lastTime
    pendingArgs = args
    if (elapsed >= intervalMs && scheduled === null) {
      lastTime = now
      fn(...args)
      pendingArgs = null
      return
    }
    if (scheduled !== null) return
    const delay = Math.max(0, intervalMs - elapsed)
    scheduled = (setTimeout(() => {
      scheduled = null
      lastTime = Date.now()
      if (pendingArgs) {
        fn(...pendingArgs)
        pendingArgs = null
      }
    }, delay) as unknown) as number
  }
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** Total up timestamps/interval sanity for an event stream (for diagnostics). */
export function basicEventDiagnostics(events: AgentEvent[]) {
  if (events.length === 0) return { durationMs: 0, avgDelta: 0 }
  const t0 = events[0]!.timestamp
  const t1 = events[events.length - 1]!.timestamp
  const durationMs = Math.max(0, t1 - t0)
  let deltas = 0
  for (let i = 1; i < events.length; i++) deltas += Math.max(0, events[i]!.timestamp - events[i - 1]!.timestamp)
  return { durationMs, avgDelta: events.length > 1 ? deltas / (events.length - 1) : 0 }
}

// ---------------------------------------------------------------------------
// DiffCoalescer — Last-Write-Wins merge by (type, id)
// ---------------------------------------------------------------------------

/** Key function for coalescing: unique per entity per diff type */
function diffKey(change: DiffChange): string {
  switch (change.type) {
    case 'agent_move':
      return `am:${change.id}`
    case 'building_stats':
      return `bs:${change.id}`
    case 'fx':
      return `fx:${change.target_id}:${change.fx}`
    case 'tile_create':
      return `tc:${change.id}`
    case 'telemetry':
      return 'tel'
    case 'log':
      // Logs are never coalesced — accumulate all
      return `log:${change.event.dedupe_key}`
    default:
      return `unk:${Math.random()}`
  }
}

/**
 * Accumulates DiffChange entries with last-write-wins semantics per (type, id).
 * flush() returns all unique latest changes and resets.
 * Zero-allocation on the hot path (reuses the internal map).
 */
export class DiffCoalescer {
  private pending = new Map<string, DiffChange>()

  /** Add a change; if same key exists, overwrite (LWW) */
  add(change: DiffChange): void {
    this.pending.set(diffKey(change), change)
  }

  /** Add multiple changes */
  addAll(changes: DiffChange[]): void {
    for (let i = 0; i < changes.length; i++) {
      this.pending.set(diffKey(changes[i]!), changes[i]!)
    }
  }

  /** Return all coalesced changes and clear the buffer */
  flush(): DiffChange[] {
    if (this.pending.size === 0) return []
    const out = Array.from(this.pending.values())
    this.pending.clear()
    return out
  }

  /** Number of pending unique entries */
  get size(): number {
    return this.pending.size
  }

  /** Clear without flushing */
  clear(): void {
    this.pending.clear()
  }
}

// ---------------------------------------------------------------------------
// SharedArrayBuffer Ring Buffer (optional, gated behind cross-origin isolation)
// ---------------------------------------------------------------------------

/** Check if SharedArrayBuffer is available (requires cross-origin isolation) */
export function canUseSAB(): boolean {
  try {
    return (
      typeof SharedArrayBuffer !== 'undefined' &&
      typeof Atomics !== 'undefined' &&
      (typeof globalThis !== 'undefined'
        ? !!(globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated
        : false)
    )
  } catch {
    return false
  }
}

/**
 * Lock-free SPSC (single-producer, single-consumer) ring buffer over SAB.
 * Uses Atomics for read/write cursor synchronization.
 *
 * Memory layout:
 *   [0..3]  writeHead (Uint32, Atomics)
 *   [4..7]  readHead  (Uint32, Atomics)
 *   [8..]   data ring
 *
 * Each message is prefixed with a 4-byte length header.
 */
export class SABRingBuffer {
  private sab: SharedArrayBuffer
  private control: Int32Array
  private data: Uint8Array
  private ringStart = 8
  private capacity: number

  constructor(capacityBytesOrExisting?: number | SharedArrayBuffer) {
    if (capacityBytesOrExisting instanceof SharedArrayBuffer) {
      this.sab = capacityBytesOrExisting
      this.control = new Int32Array(this.sab, 0, 2)
      this.data = new Uint8Array(this.sab, this.ringStart)
      this.capacity = this.sab.byteLength - this.ringStart
    } else {
      const capacityBytes = capacityBytesOrExisting ?? 1024 * 1024
      const totalBytes = 8 + capacityBytes
      this.sab = new SharedArrayBuffer(totalBytes)
      this.control = new Int32Array(this.sab, 0, 2) // [writeHead, readHead]
      this.data = new Uint8Array(this.sab, this.ringStart)
      this.capacity = capacityBytes
      // Initialize cursors
      Atomics.store(this.control, 0, 0)
      Atomics.store(this.control, 1, 0)
    }
  }

  /** Get the underlying SAB for transfer to worker */
  get buffer(): SharedArrayBuffer {
    return this.sab
  }

  /** Write a message into the ring. Returns false if not enough space. */
  write(msg: Uint8Array): boolean {
    const needed = 4 + msg.byteLength
    const writeHead = Atomics.load(this.control, 0)
    const readHead = Atomics.load(this.control, 1)

    // Available space (SPSC: writer sees stale readHead — safe, just conservative)
    const used = (writeHead - readHead + this.capacity) % this.capacity
    const free = this.capacity - used - 1 // -1 to distinguish full vs empty
    if (needed > free) return false

    // Write 4-byte length prefix
    const lenBytes = new Uint8Array(4)
    new DataView(lenBytes.buffer).setUint32(0, msg.byteLength, true)

    let pos = writeHead
    for (let i = 0; i < 4; i++) {
      this.data[pos % this.capacity] = lenBytes[i]!
      pos++
    }
    for (let i = 0; i < msg.byteLength; i++) {
      this.data[pos % this.capacity] = msg[i]!
      pos++
    }

    Atomics.store(this.control, 0, pos % this.capacity)
    return true
  }

  /** Read a message from the ring. Returns null if empty. */
  read(): Uint8Array | null {
    const writeHead = Atomics.load(this.control, 0)
    const readHead = Atomics.load(this.control, 1)

    if (readHead === writeHead) return null

    // Read 4-byte length prefix
    const lenBytes = new Uint8Array(4)
    let pos = readHead
    for (let i = 0; i < 4; i++) {
      lenBytes[i] = this.data[pos % this.capacity]!
      pos++
    }
    const msgLen = new DataView(lenBytes.buffer).getUint32(0, true)
    if (msgLen === 0 || msgLen > this.capacity) return null

    const out = new Uint8Array(msgLen)
    for (let i = 0; i < msgLen; i++) {
      out[i] = this.data[pos % this.capacity]!
      pos++
    }

    Atomics.store(this.control, 1, pos % this.capacity)
    return out
  }
}

// ---------------------------------------------------------------------------
// JSON encode/decode helpers for SAB messages
// ---------------------------------------------------------------------------

const te: TextEncoder | null = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null
const td: TextDecoder | null = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null

export function encodeJSON(obj: unknown): Uint8Array {
  const str = JSON.stringify(obj)
  return te ? te.encode(str) : new Uint8Array([])
}

export function decodeJSON(bytes: Uint8Array): unknown {
  const str = td ? td.decode(bytes) : ''
  try { return JSON.parse(str) } catch { return null }
}

/** Write a diff payload to SAB as a JSON frame. Returns false on backpressure. */
export function writeDiffToSAB(ring: SABRingBuffer, payload: DiffEnvelope): boolean {
  return ring.write(encodeJSON({ type: 'diff', payload }))
}
