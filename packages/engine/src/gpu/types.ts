// ============================================================================
// GPU Types — Shared interfaces for WebGPU modules
// ============================================================================

/** Per-marker instance data packed for GPU upload (32 bytes per instance) */
export interface MarkerInstanceData {
  /** World X position */
  x: number
  /** World Y position */
  y: number
  /** RGBA color packed as 4 floats (0-1 range) */
  r: number
  g: number
  b: number
  a: number
  /** Scale factor */
  scale: number
  /** Padding to align to 32 bytes */
  _pad: number
}

/** Per-cell heat data for the heatmap compute shader */
export interface HeatCell {
  /** World X position (center) */
  x: number
  /** World Y position (center) */
  y: number
  /** Width in pixels */
  w: number
  /** Height in pixels */
  h: number
  /** Heat intensity 0-1 */
  intensity: number
}

/** GPU context wrapper — holds device + adapter lifecycle */
export interface GpuContext {
  adapter: GPUAdapter
  device: GPUDevice
  destroy(): void
}

/** Marker batch update from diff system */
export interface MarkerBatch {
  /** Marker instances to upload. If null, no update this frame. */
  instances: Float32Array | null
  /** Number of active instances (may be less than buffer capacity) */
  count: number
}

/** Heatmap update from diff system */
export interface HeatmapUpdate {
  /** Heat cells to upload */
  cells: Float32Array | null
  /** Number of active cells */
  count: number
  /** Canvas width for output texture */
  canvasWidth: number
  /** Canvas height for output texture */
  canvasHeight: number
}
