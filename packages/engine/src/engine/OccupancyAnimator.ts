// ============================================================================
// Occupancy Animator — Animates "work tile" occupancy within building footprints
//
// Shows pulsing/highlighting tiles when work is happening in a building.
// Sits just above buildings (zIndex 6) so the visual feedback overlays the
// building graphics but stays below labels and fog.
//
// Three animation kinds:
//   work   — pulsing green highlight (file edits, tool use)
//   delete — shrinking red overlay (file deletions)
//   rename — blue sliding highlight (renames/moves)
// ============================================================================

import { Container, Graphics } from 'pixi.js'

/** Duration of occupancy animation in ms */
export const ANIMATION_DURATION_MS = 2000

// ---------------------------------------------------------------------------
// Pure data layer (testable without PixiJS)
// ---------------------------------------------------------------------------

export type OccupancyKind = 'work' | 'delete' | 'rename' | 'error' | 'tool_icon' | 'tile_create' | 'tile_edit' | 'tool_error'

export interface OccupancyState {
  buildingId: string
  px: number
  py: number
  width: number
  height: number
  startTime: number
  kind: OccupancyKind
}

/** Duration for tile-level FX (shorter than building-level) */
export const TILE_FX_DURATION_MS = 800

/** Duration for transient tool errors (fast red flash) */
export const TOOL_ERROR_FX_DURATION_MS = 600

/** Check whether an animation is still active */
export function isAnimationActive(anim: OccupancyState, now: number): boolean {
  const duration = anim.kind === 'tool_error' ? TOOL_ERROR_FX_DURATION_MS
    : (anim.kind === 'tool_icon' || anim.kind === 'tile_create' || anim.kind === 'tile_edit')
      ? TILE_FX_DURATION_MS
      : ANIMATION_DURATION_MS
  return now - anim.startTime < duration
}

/** Compute animation progress (0-1) and fade-out factor for an active animation */
export function animationProgress(
  anim: OccupancyState,
  now: number,
): { progress: number; fadeOut: number } {
  const duration = anim.kind === 'tool_error' ? TOOL_ERROR_FX_DURATION_MS
    : (anim.kind === 'tool_icon' || anim.kind === 'tile_create' || anim.kind === 'tile_edit')
      ? TILE_FX_DURATION_MS
      : ANIMATION_DURATION_MS
  const elapsed = now - anim.startTime
  const progress = Math.min(1, elapsed / duration)
  const fadeOut = 1 - progress
  return { progress, fadeOut }
}

/** Compute work pulse alpha for a given progress */
export function workPulseAlpha(progress: number, fadeOut: number): number {
  const pulse = Math.sin(progress * Math.PI * 3) * 0.3 + 0.3
  return pulse * fadeOut
}

/** Compute delete shrink factor for a given progress */
export function deleteShrinkRect(
  px: number,
  py: number,
  width: number,
  height: number,
  progress: number,
): { sx: number; sy: number; sw: number; sh: number } | null {
  const shrink = progress * 0.3
  const sx = px + width * shrink
  const sy = py + height * shrink
  const sw = width * (1 - shrink * 2)
  const sh = height * (1 - shrink * 2)
  if (sw <= 0 || sh <= 0) return null
  return { sx, sy, sw, sh }
}

/** Compute rename slide offset for a given progress */
export function renameSlideOffset(progress: number): number {
  return progress * 8
}

/** Prune expired animations from a list */
export function pruneAnimations(
  anims: OccupancyState[],
  now: number,
): OccupancyState[] {
  return anims.filter((a) => isAnimationActive(a, now))
}

// ---------------------------------------------------------------------------
// PixiJS renderer
// ---------------------------------------------------------------------------

export class OccupancyAnimator {
  container: Container
  private graphics: Graphics
  private activeAnimations: OccupancyState[] = []

  constructor() {
    this.container = new Container()
    this.container.label = 'occupancy-animator'
    this.container.eventMode = 'none'
    this.container.interactiveChildren = false

    this.graphics = new Graphics()
    this.container.addChild(this.graphics)
  }

  /** Trigger a work occupancy animation for a building */
  animateWork(
    buildingId: string,
    px: number,
    py: number,
    width: number,
    height: number,
  ): void {
    this.activeAnimations.push({
      buildingId,
      px,
      py,
      width,
      height,
      startTime: Date.now(),
      kind: 'work',
    })
  }

  /** Trigger a deletion animation */
  animateDelete(
    buildingId: string,
    px: number,
    py: number,
    width: number,
    height: number,
  ): void {
    this.activeAnimations.push({
      buildingId,
      px,
      py,
      width,
      height,
      startTime: Date.now(),
      kind: 'delete',
    })
  }

  /** Trigger an error flash animation (pulsing red) */
  animateError(
    buildingId: string,
    px: number,
    py: number,
    width: number,
    height: number,
  ): void {
    this.activeAnimations.push({
      buildingId,
      px,
      py,
      width,
      height,
      startTime: Date.now(),
      kind: 'error',
    })
  }

  /** Trigger a rename/move animation */
  animateRename(
    buildingId: string,
    px: number,
    py: number,
    width: number,
    height: number,
  ): void {
    this.activeAnimations.push({
      buildingId,
      px,
      py,
      width,
      height,
      startTime: Date.now(),
      kind: 'rename',
    })
  }

  // -----------------------------------------------------------------------
  // Tile-level animations (F3.2 — target exact tile, not full building)
  // -----------------------------------------------------------------------

  /** Show a tool icon flash at a specific tile position within a building */
  animateToolAtTile(
    buildingId: string,
    tilePx: number,
    tilePy: number,
    tileSize: number,
  ): void {
    this.activeAnimations.push({
      buildingId,
      px: tilePx,
      py: tilePy,
      width: tileSize,
      height: tileSize,
      startTime: Date.now(),
      kind: 'tool_icon',
    })
  }

  /** Animate a transient red flash at a specific tile (tool error — fast fade) */
  animateToolError(
    buildingId: string,
    tilePx: number,
    tilePy: number,
    tileSize: number,
  ): void {
    this.activeAnimations.push({
      buildingId,
      px: tilePx,
      py: tilePy,
      width: tileSize,
      height: tileSize,
      startTime: Date.now(),
      kind: 'tool_error',
    })
  }

  /** Animate a green pulse on a specific tile (file edit) */
  animateTileEdit(
    buildingId: string,
    tilePx: number,
    tilePy: number,
    tileSize: number,
  ): void {
    this.activeAnimations.push({
      buildingId,
      px: tilePx,
      py: tilePy,
      width: tileSize,
      height: tileSize,
      startTime: Date.now(),
      kind: 'tile_edit',
    })
  }

  /** Animate a spawn glow on a specific tile (file create) */
  animateTileCreate(
    buildingId: string,
    tilePx: number,
    tilePy: number,
    tileSize: number,
  ): void {
    this.activeAnimations.push({
      buildingId,
      px: tilePx,
      py: tilePy,
      width: tileSize,
      height: tileSize,
      startTime: Date.now(),
      kind: 'tile_create',
    })
  }

  update(): void {
    const now = Date.now()

    // Prune expired animations
    this.activeAnimations = pruneAnimations(this.activeAnimations, now)

    if (this.activeAnimations.length === 0) {
      this.graphics.clear()
      return
    }

    this.graphics.clear()

    for (const anim of this.activeAnimations) {
      const { progress, fadeOut } = animationProgress(anim, now)

      switch (anim.kind) {
        case 'work': {
          // Pulsing green highlight
          const alpha = workPulseAlpha(progress, fadeOut)
          this.graphics.rect(
            anim.px + 2,
            anim.py + 2,
            anim.width - 4,
            anim.height - 4,
          )
          this.graphics.fill({ color: 0x22c55e, alpha })
          break
        }
        case 'delete': {
          // Shrinking red overlay
          const rect = deleteShrinkRect(
            anim.px,
            anim.py,
            anim.width,
            anim.height,
            progress,
          )
          if (rect) {
            this.graphics.rect(rect.sx, rect.sy, rect.sw, rect.sh)
            this.graphics.fill({ color: 0xef4444, alpha: 0.4 * fadeOut })
          }
          break
        }
        case 'error': {
          // Pulsing red highlight (same pattern as work but red)
          const errorAlpha = workPulseAlpha(progress, fadeOut)
          this.graphics.rect(
            anim.px + 2,
            anim.py + 2,
            anim.width - 4,
            anim.height - 4,
          )
          this.graphics.fill({ color: 0xef4444, alpha: errorAlpha })
          break
        }
        case 'rename': {
          // Blue sliding highlight
          const slide = renameSlideOffset(progress)
          this.graphics.rect(anim.px + slide, anim.py, anim.width, anim.height)
          this.graphics.fill({ color: 0x3b82f6, alpha: 0.3 * fadeOut })
          break
        }
        case 'tool_icon': {
          // Bright white/yellow tool flash at tile position — shows where tool is acting
          const flashAlpha = (1 - progress) * 0.6
          this.graphics.roundRect(
            anim.px + 2, anim.py + 2,
            anim.width - 4, anim.height - 4, 3,
          )
          this.graphics.fill({ color: 0xffd700, alpha: flashAlpha })
          // Tool icon border
          this.graphics.roundRect(
            anim.px + 1, anim.py + 1,
            anim.width - 2, anim.height - 2, 3,
          )
          this.graphics.stroke({ color: 0xffffff, alpha: flashAlpha * 0.8, width: 1.5 })
          break
        }
        case 'tool_error': {
          // Transient red flash at tile — tool failure (HTTP 403, guardrail, etc.)
          // Same shape as tool_icon but red, faster fade (600ms total)
          const errAlpha = (1 - progress) * 0.7
          this.graphics.roundRect(
            anim.px + 2, anim.py + 2,
            anim.width - 4, anim.height - 4, 3,
          )
          this.graphics.fill({ color: 0xef4444, alpha: errAlpha })
          // Red border
          this.graphics.roundRect(
            anim.px + 1, anim.py + 1,
            anim.width - 2, anim.height - 2, 3,
          )
          this.graphics.stroke({ color: 0xff6b6b, alpha: errAlpha * 0.8, width: 1.5 })
          break
        }
        case 'tile_create': {
          // Expanding green glow at tile — file spawning
          const scale = 0.5 + progress * 0.5 // grows from 50% to 100%
          const createAlpha = fadeOut * 0.5
          const w = anim.width * scale
          const h = anim.height * scale
          const cx = anim.px + anim.width / 2
          const cy = anim.py + anim.height / 2
          this.graphics.roundRect(cx - w / 2, cy - h / 2, w, h, 2)
          this.graphics.fill({ color: 0x22c55e, alpha: createAlpha })
          this.graphics.roundRect(cx - w / 2, cy - h / 2, w, h, 2)
          this.graphics.stroke({ color: 0x4ade80, alpha: createAlpha * 1.5, width: 1 })
          break
        }
        case 'tile_edit': {
          // Pulsing green on exact tile — file being edited
          const editPulse = Math.sin(progress * Math.PI * 2) * 0.25 + 0.25
          const editAlpha = editPulse * fadeOut
          this.graphics.roundRect(
            anim.px + 1, anim.py + 1,
            anim.width - 2, anim.height - 2, 2,
          )
          this.graphics.fill({ color: 0x22c55e, alpha: editAlpha })
          break
        }
      }
    }
  }

  /** Clear all active animations */
  reset(): void {
    this.activeAnimations = []
    this.graphics.clear()
  }

  destroy(): void {
    this.graphics.destroy()
    this.container.destroy({ children: true })
  }
}
