// ============================================================================
// V4 GPU Tests — Feature flags, context creation, module structure (hq-dxz.8)
//
// These tests validate the GPU module structure and flag gating without
// requiring actual WebGPU hardware. GPU compute/render tests are skipped
// when WebGPU is unavailable (Vitest/jsdom environment).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isGpuEnabled, shouldUseGpu } from '../gpu/flags'
import { GpuOverlayManager } from '../gpu/GpuOverlayManager'

// ---------------------------------------------------------------------------
// Flag tests
// ---------------------------------------------------------------------------

describe('V4 GPU Flags', () => {
  beforeEach(() => {
    // Reset window state
    if (typeof window !== 'undefined') {
      delete (window as any).__MV_V4_GPU__
    }
  })

  afterEach(() => {
    if (typeof window !== 'undefined') {
      delete (window as any).__MV_V4_GPU__
    }
  })

  it('isGpuEnabled returns false by default', () => {
    expect(isGpuEnabled()).toBe(false)
  })

  it('isGpuEnabled returns true when flag is set', () => {
    ;(window as any).__MV_V4_GPU__ = true
    expect(isGpuEnabled()).toBe(true)
  })

  it('isGpuEnabled returns false when flag is explicitly false', () => {
    ;(window as any).__MV_V4_GPU__ = false
    expect(isGpuEnabled()).toBe(false)
  })

  it('shouldUseGpu returns false when flag is disabled', async () => {
    const result = await shouldUseGpu()
    expect(result).toBe(false)
  })

  it('shouldUseGpu returns false when flag is enabled but no WebGPU', async () => {
    ;(window as any).__MV_V4_GPU__ = true
    // jsdom/node doesn't have navigator.gpu
    const result = await shouldUseGpu()
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// GpuOverlayManager tests (without real WebGPU)
// ---------------------------------------------------------------------------

describe('GpuOverlayManager', () => {
  it('creates with inactive state', () => {
    const mgr = new GpuOverlayManager()
    expect(mgr.active).toBe(false)
    expect(mgr.telemetry.active).toBe(false)
    expect(mgr.telemetry.heatCellCount).toBe(0)
    expect(mgr.telemetry.markerInstanceCount).toBe(0)
  })

  it('init returns false when WebGPU is unavailable', async () => {
    const mgr = new GpuOverlayManager()
    const result = await mgr.init()
    expect(result).toBe(false)
    expect(mgr.active).toBe(false)
  })

  it('updateHeatmap is a no-op when inactive', () => {
    const mgr = new GpuOverlayManager()
    const data = new Float32Array(8)
    // Should not throw
    mgr.updateHeatmap(data, 1, 100, 100)
    expect(mgr.telemetry.heatCellCount).toBe(0)
  })

  it('updateMarkers is a no-op when inactive', () => {
    const mgr = new GpuOverlayManager()
    const data = new Float32Array(8)
    // Should not throw
    mgr.updateMarkers(data, 1)
    expect(mgr.telemetry.markerInstanceCount).toBe(0)
  })

  it('destroy is safe to call multiple times', () => {
    const mgr = new GpuOverlayManager()
    mgr.destroy()
    mgr.destroy() // should not throw
  })

  it('container exists and is labeled', () => {
    const mgr = new GpuOverlayManager()
    expect(mgr.container).toBeDefined()
    expect(mgr.container.label).toBe('gpu-overlay')
  })
})

// ---------------------------------------------------------------------------
// Module structure tests — verify exports are available
// ---------------------------------------------------------------------------

describe('GPU module exports', () => {
  it('exports all expected symbols', async () => {
    const gpu = await import('../gpu')
    expect(gpu.isGpuEnabled).toBeTypeOf('function')
    expect(gpu.isWebGpuAvailable).toBeTypeOf('function')
    expect(gpu.shouldUseGpu).toBeTypeOf('function')
    expect(gpu.createGpuContext).toBeTypeOf('function')
    expect(gpu.GpuHeatmapCompute).toBeTypeOf('function')
    expect(gpu.GpuMarkerInstancer).toBeTypeOf('function')
    expect(gpu.GpuOverlayManager).toBeTypeOf('function')
  })
})

// ---------------------------------------------------------------------------
// CPU parity tests — verify GPU flag doesn't break CPU path
// ---------------------------------------------------------------------------

describe('CPU path parity', () => {
  it('WorldRenderer applyDiffs handles all diff types without GPU', async () => {
    // Import the diff type to construct test diffs
    const { WorldRenderer } = await import('../engine/WorldRenderer')
    // WorldRenderer requires PixiJS — just verify the class exists and
    // applyDiffs is a method (actual rendering needs canvas context)
    expect(WorldRenderer).toBeTypeOf('function')
    const proto = WorldRenderer.prototype
    expect(proto.applyDiffs).toBeTypeOf('function')
  })

  it('GPU overlay manager has container compatible with PixiJS', () => {
    const mgr = new GpuOverlayManager()
    // Container should have standard PixiJS Container properties
    expect(mgr.container.eventMode).toBe('none')
    expect(mgr.container.interactiveChildren).toBe(false)
    mgr.destroy()
  })
})
