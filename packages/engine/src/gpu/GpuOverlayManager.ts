// ============================================================================
// GPU Overlay Manager — Integration layer between WorldRenderer and GPU modules
//
// Sits alongside HeatOverlayManager. When V4_GPU is enabled and WebGPU is
// available, this manager uses GpuHeatmapCompute for heat overlays and
// GpuMarkerInstancer for agent/event markers. Falls back gracefully if
// initialization fails at any point.
//
// The CPU path (HeatOverlayManager, AgentManager, EventMarkerManager) remains
// active and feature-complete. The GPU path provides additional headroom (2-5x)
// for large scenarios.
// ============================================================================

import { Container, Sprite, Texture } from 'pixi.js'
import { createGpuContext } from './context'
import { GpuHeatmapCompute } from './heatmapCompute'
import { GpuMarkerInstancer } from './markerInstancer'
import type { GpuContext } from './types'

/** Telemetry for GPU overlay — exposed on WorldRenderer for HUD */
export interface GpuTelemetry {
  /** Whether GPU path is active */
  active: boolean
  /** Number of heat cells in last dispatch */
  heatCellCount: number
  /** Number of marker instances in last draw */
  markerInstanceCount: number
  /** Time spent in GPU dispatch (ms, approximate) */
  gpuDispatchMs: number
}

/**
 * GPU Overlay Manager — optional WebGPU acceleration for overlays and markers.
 *
 * Lifecycle:
 *   const mgr = new GpuOverlayManager()
 *   await mgr.init()  // returns false if GPU unavailable
 *   // per frame:
 *   mgr.updateHeatmap(cells, count, w, h)
 *   await mgr.renderHeatmap()  // writes RGBA to PixiJS sprite texture
 *   mgr.updateMarkers(instances, count)
 *   mgr.destroy()
 */
export class GpuOverlayManager {
  /** PixiJS container for the GPU-rendered heat overlay sprite */
  container: Container

  private gpuCtx: GpuContext | null = null
  private heatmapCompute: GpuHeatmapCompute | null = null
  private markerInstancer: GpuMarkerInstancer | null = null
  private heatSprite: Sprite | null = null
  private heatCanvas: OffscreenCanvas | null = null
  private heatCanvasCtx: OffscreenCanvasRenderingContext2D | null = null
  private _active = false
  private _telemetry: GpuTelemetry = {
    active: false,
    heatCellCount: 0,
    markerInstanceCount: 0,
    gpuDispatchMs: 0,
  }

  /** Throttle: only update heat texture every N ms */
  private lastHeatRender = 0
  private static readonly HEAT_RENDER_INTERVAL_MS = 100

  constructor() {
    this.container = new Container()
    this.container.label = 'gpu-overlay'
    this.container.eventMode = 'none'
    this.container.interactiveChildren = false
  }

  /** Whether GPU path is active and usable */
  get active(): boolean {
    return this._active
  }

  /** Last telemetry snapshot */
  get telemetry(): GpuTelemetry {
    return this._telemetry
  }

  /**
   * Initialize GPU context and sub-modules.
   * Returns true if GPU path is active; false falls back to CPU.
   */
  async init(): Promise<boolean> {
    try {
      this.gpuCtx = await createGpuContext()
      if (!this.gpuCtx) return false

      // Initialize heatmap compute
      this.heatmapCompute = new GpuHeatmapCompute(this.gpuCtx)
      this.heatmapCompute.init()

      // Initialize marker instancer
      this.markerInstancer = new GpuMarkerInstancer(this.gpuCtx)
      this.markerInstancer.init()

      // Create an offscreen canvas for the heatmap texture
      // We'll blit GPU output to this canvas → PixiJS Texture
      this.heatCanvas = new OffscreenCanvas(1, 1)
      this.heatCanvasCtx = this.heatCanvas.getContext('2d')

      // Create PixiJS sprite for the heatmap overlay
      this.heatSprite = new Sprite()
      this.heatSprite.label = 'gpu-heatmap'
      this.heatSprite.eventMode = 'none'
      this.heatSprite.alpha = 1.0
      this.container.addChild(this.heatSprite)

      this._active = true
      this._telemetry.active = true
      return true
    } catch (e) {
      console.warn('[gpu-overlay] Failed to initialize, falling back to CPU:', e)
      this.cleanup()
      return false
    }
  }

  /**
   * Upload heat cell data and dispatch compute shader.
   * cellData: Float32Array, 8 floats per cell [x, y, w, h, intensity, pad, pad, pad]
   */
  updateHeatmap(cellData: Float32Array, cellCount: number, canvasWidth: number, canvasHeight: number): void {
    if (!this._active || !this.heatmapCompute) return

    const now = performance.now()
    if (now - this.lastHeatRender < GpuOverlayManager.HEAT_RENDER_INTERVAL_MS) return
    this.lastHeatRender = now

    const t0 = performance.now()
    this.heatmapCompute.dispatch(cellData, cellCount, canvasWidth, canvasHeight)
    this._telemetry.heatCellCount = cellCount
    this._telemetry.gpuDispatchMs = performance.now() - t0
  }

  /**
   * Read back heatmap GPU output and blit to PixiJS sprite texture.
   * Call this after updateHeatmap() — it's async due to GPU readback.
   */
  async renderHeatmap(canvasWidth: number, canvasHeight: number): Promise<void> {
    if (!this._active || !this.heatmapCompute || !this.heatSprite) return
    if (canvasWidth === 0 || canvasHeight === 0) return

    const pixels = await this.heatmapCompute.readOutput()
    if (!pixels) return

    // Resize offscreen canvas if needed
    if (!this.heatCanvas || !this.heatCanvasCtx) return
    if (this.heatCanvas.width !== canvasWidth || this.heatCanvas.height !== canvasHeight) {
      this.heatCanvas.width = canvasWidth
      this.heatCanvas.height = canvasHeight
      this.heatCanvasCtx = this.heatCanvas.getContext('2d')
      if (!this.heatCanvasCtx) return
    }

    // Write pixels to canvas
    const imageData = new ImageData(
      new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength),
      canvasWidth,
      canvasHeight,
    )
    this.heatCanvasCtx.putImageData(imageData, 0, 0)

    // Update PixiJS sprite texture from canvas
    const bitmap = await createImageBitmap(this.heatCanvas)
    this.heatSprite.texture = Texture.from(bitmap)
  }

  /**
   * Upload marker instance data.
   * data: Float32Array, 8 floats per instance [x, y, r, g, b, a, scale, pad]
   */
  updateMarkers(data: Float32Array, count: number): void {
    if (!this._active || !this.markerInstancer) return
    this.markerInstancer.updateInstances(data, count)
    this._telemetry.markerInstanceCount = count
  }

  private cleanup(): void {
    this.heatmapCompute?.destroy()
    this.heatmapCompute = null
    this.markerInstancer?.destroy()
    this.markerInstancer = null
    this.gpuCtx?.destroy()
    this.gpuCtx = null
    this._active = false
    this._telemetry.active = false
  }

  destroy(): void {
    this.cleanup()
    this.heatSprite?.destroy()
    this.container.destroy({ children: true })
  }
}
