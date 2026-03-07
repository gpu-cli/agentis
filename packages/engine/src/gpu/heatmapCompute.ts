// ============================================================================
// GPU Heatmap Compute — WebGPU compute shader for heat overlay
//
// Replaces the CPU-based HeatOverlayManager Graphics.rect() loop with a
// compute shader that writes heat intensity to a texture. The texture is
// then composited by PixiJS as a sprite overlay.
//
// This is the primary GPU acceleration target: heatmap computation scales
// O(buildings * pixels) on CPU but is embarrassingly parallel on GPU.
// ============================================================================

import type { GpuContext } from './types'

/** WGSL compute shader for heatmap generation */
const HEATMAP_SHADER = /* wgsl */ `
struct HeatCell {
  x: f32,
  y: f32,
  w: f32,
  h: f32,
  intensity: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
};

struct Params {
  cellCount: u32,
  canvasWidth: u32,
  canvasHeight: u32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read> cells: array<HeatCell>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> output: array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pixelIdx = gid.x;
  let totalPixels = params.canvasWidth * params.canvasHeight;
  if (pixelIdx >= totalPixels) {
    return;
  }

  let px = f32(pixelIdx % params.canvasWidth);
  let py = f32(pixelIdx / params.canvasWidth);

  var heat: f32 = 0.0;

  for (var i: u32 = 0u; i < params.cellCount; i = i + 1u) {
    let cell = cells[i];
    // Expand by 4px for outer glow
    let glowExpand: f32 = 4.0;
    let left = cell.x - glowExpand;
    let top = cell.y - glowExpand;
    let right = cell.x + cell.w + glowExpand;
    let bottom = cell.y + cell.h + glowExpand;

    if (px >= left && px < right && py >= top && py < bottom) {
      // Distance-based falloff from cell center
      let cx = cell.x + cell.w * 0.5;
      let cy = cell.y + cell.h * 0.5;
      let dx = (px - cx) / (cell.w * 0.5 + glowExpand);
      let dy = (py - cy) / (cell.h * 0.5 + glowExpand);
      let dist = sqrt(dx * dx + dy * dy);
      let falloff = max(0.0, 1.0 - dist);
      heat = heat + cell.intensity * falloff * 0.4;
    }
  }

  heat = min(heat, 0.6); // clamp to MAX_INTENSITY

  // Pack as RGBA8 (warm orange glow: #ff6b35 base)
  let r = u32(min(255.0, 255.0 * heat * 1.0));
  let g = u32(min(255.0, 107.0 * heat));
  let b = u32(min(255.0, 53.0 * heat));
  let a = u32(min(255.0, 255.0 * heat));
  output[pixelIdx] = r | (g << 8u) | (b << 16u) | (a << 24u);
}
`

/** Maximum heat cells we support in one dispatch */
const MAX_CELLS = 4096

/**
 * GPU-accelerated heatmap generator.
 *
 * Usage:
 *   const hm = new GpuHeatmapCompute(ctx)
 *   hm.init()
 *   // each frame:
 *   hm.update(cellData, cellCount, width, height)
 *   const pixels = hm.readOutput() // Uint8Array RGBA
 */
export class GpuHeatmapCompute {
  private ctx: GpuContext
  private pipeline: GPUComputePipeline | null = null
  private bindGroupLayout: GPUBindGroupLayout | null = null
  private cellBuffer: GPUBuffer | null = null
  private paramsBuffer: GPUBuffer | null = null
  private outputBuffer: GPUBuffer | null = null
  private readbackBuffer: GPUBuffer | null = null
  private bindGroup: GPUBindGroup | null = null
  private currentWidth = 0
  private currentHeight = 0
  private initialized = false

  constructor(ctx: GpuContext) {
    this.ctx = ctx
  }

  /** Create pipeline and static buffers */
  init(): void {
    if (this.initialized) return
    const { device } = this.ctx

    const shaderModule = device.createShaderModule({
      label: 'heatmap-compute',
      code: HEATMAP_SHADER,
    })

    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'heatmap-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    this.pipeline = device.createComputePipeline({
      label: 'heatmap-pipeline',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    })

    // Cell buffer: MAX_CELLS * 32 bytes (8 floats per cell)
    this.cellBuffer = device.createBuffer({
      label: 'heatmap-cells',
      size: MAX_CELLS * 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    // Params buffer: 16 bytes (cellCount, canvasWidth, canvasHeight, pad)
    this.paramsBuffer = device.createBuffer({
      label: 'heatmap-params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    this.initialized = true
  }

  /**
   * Dispatch heatmap compute for the given cells.
   * cellData is a Float32Array with 8 floats per cell: [x, y, w, h, intensity, pad, pad, pad]
   */
  dispatch(cellData: Float32Array, cellCount: number, canvasWidth: number, canvasHeight: number): void {
    if (!this.initialized || !this.pipeline || !this.cellBuffer || !this.paramsBuffer) return

    const { device } = this.ctx
    const clampedCells = Math.min(cellCount, MAX_CELLS)
    const totalPixels = canvasWidth * canvasHeight
    if (totalPixels === 0) return

    // Recreate output buffer if canvas size changed
    if (canvasWidth !== this.currentWidth || canvasHeight !== this.currentHeight) {
      this.outputBuffer?.destroy()
      this.readbackBuffer?.destroy()

      this.outputBuffer = device.createBuffer({
        label: 'heatmap-output',
        size: totalPixels * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      })

      this.readbackBuffer = device.createBuffer({
        label: 'heatmap-readback',
        size: totalPixels * 4,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      })

      this.currentWidth = canvasWidth
      this.currentHeight = canvasHeight

      // Recreate bind group with new output buffer
      this.bindGroup = device.createBindGroup({
        label: 'heatmap-bg',
        layout: this.bindGroupLayout!,
        entries: [
          { binding: 0, resource: { buffer: this.cellBuffer } },
          { binding: 1, resource: { buffer: this.paramsBuffer } },
          { binding: 2, resource: { buffer: this.outputBuffer } },
        ],
      })
    }

    if (!this.outputBuffer || !this.bindGroup) return

    // Upload cell data
    device.queue.writeBuffer(this.cellBuffer, 0, cellData.buffer, cellData.byteOffset, clampedCells * 32)

    // Upload params
    const params = new Uint32Array([clampedCells, canvasWidth, canvasHeight, 0])
    device.queue.writeBuffer(this.paramsBuffer, 0, params.buffer)

    // Dispatch compute
    const encoder = device.createCommandEncoder({ label: 'heatmap-dispatch' })
    const pass = encoder.beginComputePass({ label: 'heatmap-pass' })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bindGroup)
    pass.dispatchWorkgroups(Math.ceil(totalPixels / 256))
    pass.end()

    // Copy output to readback buffer
    encoder.copyBufferToBuffer(this.outputBuffer, 0, this.readbackBuffer!, 0, totalPixels * 4)
    device.queue.submit([encoder.finish()])
  }

  /** Read back the computed heatmap as RGBA pixel data */
  async readOutput(): Promise<Uint8Array | null> {
    if (!this.readbackBuffer || this.currentWidth === 0 || this.currentHeight === 0) return null

    try {
      await this.readbackBuffer.mapAsync(GPUMapMode.READ)
      const data = new Uint8Array(this.readbackBuffer.getMappedRange().slice(0))
      this.readbackBuffer.unmap()
      return data
    } catch {
      return null
    }
  }

  destroy(): void {
    this.cellBuffer?.destroy()
    this.paramsBuffer?.destroy()
    this.outputBuffer?.destroy()
    this.readbackBuffer?.destroy()
    this.initialized = false
  }
}
