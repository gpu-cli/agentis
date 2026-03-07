// ============================================================================
// GPU Module — Optional WebGPU acceleration (V4_GPU flag)
//
// All exports are safe to import regardless of GPU availability.
// The GpuOverlayManager.init() call is the actual gate — it returns false
// if WebGPU is not available, and all methods become no-ops.
// ============================================================================

export { isGpuEnabled, isWebGpuAvailable, shouldUseGpu } from './flags'
export { createGpuContext } from './context'
export { GpuHeatmapCompute } from './heatmapCompute'
export { GpuMarkerInstancer } from './markerInstancer'
export { GpuOverlayManager } from './GpuOverlayManager'
export type { GpuContext, MarkerInstanceData, HeatCell, MarkerBatch, HeatmapUpdate } from './types'
export type { GpuTelemetry } from './GpuOverlayManager'
