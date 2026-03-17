// ============================================================================
// GPU Context — WebGPU device initialization and lifecycle
// ============================================================================

import type { GpuContext } from './types'

/**
 * Initialize a WebGPU device. Returns null if unavailable.
 * Caller owns the device and must call destroy() when done.
 */
export async function createGpuContext(): Promise<GpuContext | null> {
  if (typeof navigator === 'undefined') return null
  if (!('gpu' in navigator)) return null

  try {
    const gpu = navigator.gpu as GPU
    const adapter = await gpu.requestAdapter({
      powerPreference: 'low-power', // prefer integrated GPU
    })
    if (!adapter) return null

    const device = await adapter.requestDevice({
      // Request minimal limits — we only need compute + small buffers
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxComputeWorkgroupSizeX: 256,
        maxComputeWorkgroupSizeY: 1,
        maxComputeWorkgroupSizeZ: 1,
      },
    })

    // Handle device loss gracefully
    device.lost.then((info) => {
      if (info.reason !== 'destroyed') {
        console.warn('[gpu] Device lost:', info.message)
      }
    })

    return {
      adapter,
      device,
      destroy() {
        device.destroy()
      },
    }
  } catch (e) {
    console.warn('[gpu] Failed to create context:', e)
    return null
  }
}
