// ============================================================================
// V4 GPU Feature Flags — Gate all GPU code paths
// ============================================================================

/** Check if the V4_GPU flag is enabled (off by default) */
export function isGpuEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return (window as any).__MV_V4_GPU__ === true
}

/** Check if WebGPU is available in this browser */
export async function isWebGpuAvailable(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false
  if (!('gpu' in navigator)) return false
  try {
    const adapter = await (navigator as any).gpu.requestAdapter()
    return adapter !== null
  } catch {
    return false
  }
}

/** Resolve whether GPU path should be active: flag enabled AND hardware available */
export async function shouldUseGpu(): Promise<boolean> {
  if (!isGpuEnabled()) return false
  return isWebGpuAvailable()
}
