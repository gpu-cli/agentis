// ============================================================================
// Camera Controller — pixi-viewport with 6 zoom tiers + agent follow
// ============================================================================

import { Viewport } from 'pixi-viewport'
import type { Application } from 'pixi.js'
import type { ZoomTier } from '../stores/uiStore'
import { useUIStore } from '../stores/uiStore'

const TILE_SIZE = 32

/** Zoom tier thresholds (viewport scale values) */
const ZOOM_TIERS: { tier: ZoomTier; min: number; max: number }[] = [
  { tier: 'universe', min: 0, max: 0.05 },
  { tier: 'orbital', min: 0.05, max: 0.15 },
  { tier: 'island', min: 0.15, max: 0.4 },
  { tier: 'district', min: 0.4, max: 0.8 },
  { tier: 'street', min: 0.8, max: 2.0 },
  { tier: 'interior', min: 2.0, max: Infinity },
]

/** Target zoom scale for follow mode (street tier) */
const FOLLOW_ZOOM_TARGET = 1.2
/** Lerp factor for smooth camera tracking */
const FOLLOW_LERP = 0.08
/** Lerp factor for zoom-in animation */
const ZOOM_LERP = 0.06
/** Distance threshold to consider "arrived" at target */
const SNAP_THRESHOLD = 1
/** Zoom threshold to consider "arrived" at target zoom */
const ZOOM_SNAP_THRESHOLD = 0.01

export class CameraController {
  viewport: Viewport
  private currentTier: ZoomTier = 'district'
  private followingAgentId: string | null = null
  private keyHandler: ((e: KeyboardEvent) => void) | null = null
  private canvas: HTMLCanvasElement

  // Follow animation state
  private _isAnimatingToFollow = false
  private _followZoomTarget = FOLLOW_ZOOM_TARGET
  private _suppressUserInputDetection = false

  constructor(app: Application) {
    this.canvas = app.canvas as HTMLCanvasElement

    // Use CSS pixel dimensions (not physical pixels which include devicePixelRatio)
    const screenW = app.canvas.clientWidth || app.canvas.width / (window.devicePixelRatio || 1)
    const screenH = app.canvas.clientHeight || app.canvas.height / (window.devicePixelRatio || 1)

    this.viewport = new Viewport({
      screenWidth: screenW,
      screenHeight: screenH,
      worldWidth: 64 * TILE_SIZE * 4, // 4 chunks wide
      worldHeight: 64 * TILE_SIZE * 4,
      events: app.renderer.events,
    })

    this.viewport
      .drag()
      .pinch()
      .wheel({ smooth: 3 })
      .decelerate({ friction: 0.95 })
      .clampZoom({ minScale: 0.02, maxScale: 4 })

    // Set initial zoom to district level
    this.viewport.setZoom(0.6)

    // Listen for zoom changes
    this.viewport.on('zoomed', () => this.updateZoomTier())
    this.viewport.on('zoomed-end', () => this.updateZoomTier())

    // Detect user-initiated input to auto-unfollow
    this.viewport.on('drag-start', () => {
      this.onUserInput()
      this.canvas.style.cursor = 'grabbing'
    })
    this.viewport.on('drag-end', () => {
      this.canvas.style.cursor = ''
    })
    this.viewport.on('pinch-start', () => this.onUserInput())
    this.viewport.on('wheel', () => this.onUserInput())

    // Set up keyboard controls
    this.setupKeyboard()
  }

  /** Detect user pan/zoom and auto-unfollow */
  private onUserInput(): void {
    if (this._suppressUserInputDetection) return
    if (this.followingAgentId) {
      this.unfollowAgent()
    }
  }

  private updateZoomTier(): void {
    const scale = this.viewport.scale.x
    for (const { tier, min, max } of ZOOM_TIERS) {
      if (scale >= min && scale < max) {
        if (tier !== this.currentTier) {
          this.currentTier = tier
          useUIStore.getState().setZoomTier(tier)
        }
        break
      }
    }
  }

  private setupKeyboard(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      const isTypingContext =
        target?.isContentEditable === true ||
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select'

      if (isTypingContext) {
        return
      }

      const panSpeed = 20
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
          this.viewport.y += panSpeed
          break
        case 'ArrowDown':
        case 's':
          this.viewport.y -= panSpeed
          break
        case 'ArrowLeft':
        case 'a':
          this.viewport.x += panSpeed
          break
        case 'ArrowRight':
        case 'd':
          this.viewport.x -= panSpeed
          break
        case '=':
        case '+':
          this.viewport.zoomPercent(0.1, true)
          this.updateZoomTier()
          break
        case '-':
          this.viewport.zoomPercent(-0.1, true)
          this.updateZoomTier()
          break
        case 'Escape':
          this.unfollowAgent()
          break
      }
    }
    window.addEventListener('keydown', this.keyHandler)
  }

  /** Start following an agent — animates zoom + pan to their position */
  followAgent(agentId: string, worldX?: number, worldY?: number): void {
    this.followingAgentId = agentId
    useUIStore.getState().setFollowAgent(agentId)

    if (worldX !== undefined && worldY !== undefined) {
      // Start animated zoom-to
      this._isAnimatingToFollow = true
      this._followZoomTarget = FOLLOW_ZOOM_TARGET
      // Suppress user input detection during our programmatic zoom
      this._suppressUserInputDetection = true
    }
  }

  unfollowAgent(): void {
    this.followingAgentId = null
    this._isAnimatingToFollow = false
    this._suppressUserInputDetection = false
    useUIStore.getState().setFollowAgent(null)
  }

  get isFollowing(): boolean {
    return this.followingAgentId !== null
  }

  /** Call each frame when following an agent.
   *  Smoothly lerps camera to agent position. */
  updateFollowPosition(x: number, y: number): void {
    if (!this.followingAgentId) return

    if (this._isAnimatingToFollow) {
      // Animate zoom + pan to agent
      const center = this.viewport.center
      const currentScale = this.viewport.scale.x

      // Lerp position
      const dx = x - center.x
      const dy = y - center.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Lerp zoom
      const zoomDiff = Math.abs(currentScale - this._followZoomTarget)

      if (dist < SNAP_THRESHOLD && zoomDiff < ZOOM_SNAP_THRESHOLD) {
        // Arrived — switch to steady follow mode
        this._isAnimatingToFollow = false
        this._suppressUserInputDetection = false
        this.viewport.moveCenter(x, y)
        this.viewport.setZoom(this._followZoomTarget, true)
        this.updateZoomTier()
      } else {
        // Lerp toward target position
        const newX = center.x + dx * FOLLOW_LERP * 2 // faster during initial animation
        const newY = center.y + dy * FOLLOW_LERP * 2
        this.viewport.moveCenter(newX, newY)

        // Lerp zoom
        const newScale = currentScale + (this._followZoomTarget - currentScale) * ZOOM_LERP
        this.viewport.setZoom(newScale, true)
        this.updateZoomTier()
      }
    } else {
      // Steady follow mode — smooth lerp tracking
      const center = this.viewport.center
      const newX = center.x + (x - center.x) * FOLLOW_LERP
      const newY = center.y + (y - center.y) * FOLLOW_LERP
      this.viewport.moveCenter(newX, newY)
    }
  }

  moveTo(worldX: number, worldY: number): void {
    this.viewport.moveCenter(worldX, worldY)
  }

  resize(width: number, height: number): void {
    this.viewport.resize(width, height)
  }

  getZoomTier(): ZoomTier {
    return this.currentTier
  }

  getVisibleBounds(): { left: number; top: number; right: number; bottom: number } {
    const corner = this.viewport.corner
    const w = this.viewport.worldScreenWidth
    const h = this.viewport.worldScreenHeight
    return {
      left: corner.x,
      top: corner.y,
      right: corner.x + w,
      bottom: corner.y + h,
    }
  }

  destroy(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler)
      this.keyHandler = null
    }
    this.viewport.destroy()
  }
}
