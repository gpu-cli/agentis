// ============================================================================
// SpriteIcon — Renders a Kenney sprite-sheet tile as a crisp pixel-art
// <canvas> element for use in React DOM panels (not PixiJS).
//
// Usage:
//   <SpriteIcon region="hero_knight" size={24} />
//   <SpriteIcon sheet="tiny-town" col={8} row={9} size={16} />
// ============================================================================

import { useRef, useEffect } from 'react'
import {
  TINY_TOWN_REGIONS,
  TINY_DUNGEON_REGIONS,
  ASSET_PATHS,
  type SpriteRegion,
} from '../engine/SpriteConfig'
import { entitySprites } from '../engine/entity-sprite-map'

// ---------------------------------------------------------------------------
// Image cache — load each sheet PNG once
// ---------------------------------------------------------------------------

const imageCache = new Map<string, HTMLImageElement>()
const pendingLoads = new Map<string, Promise<HTMLImageElement>>()

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src)
  if (cached) return Promise.resolve(cached)

  const pending = pendingLoads.get(src)
  if (pending) return pending

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      imageCache.set(src, img)
      pendingLoads.delete(src)
      resolve(img)
    }
    img.onerror = reject
    img.src = src
  })
  pendingLoads.set(src, promise)
  return promise
}

// ---------------------------------------------------------------------------
// Region lookup
// ---------------------------------------------------------------------------

const ALL_REGIONS: Record<string, SpriteRegion> = {
  ...TINY_TOWN_REGIONS,
  ...TINY_DUNGEON_REGIONS,
}

function getSheetPath(sheet: string): string {
  if (sheet === 'tileset-tiny-town') return ASSET_PATHS.TINY_TOWN
  if (sheet === 'tileset-tiny-dungeon') return ASSET_PATHS.TINY_DUNGEON
  return ASSET_PATHS.TINY_TOWN
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpriteIconProps {
  /** Named region key from SpriteConfig (e.g. 'hero_knight', 'item_sword') */
  region?: string
  /** Override sheet + col/row directly */
  sheet?: 'tiny-town' | 'tiny-dungeon'
  col?: number
  row?: number
  /** Rendered size in CSS pixels (default 16) */
  size?: number
  /** Optional CSS class */
  className?: string
  /** Optional tint color (CSS color string) — applied via canvas composite */
  tint?: string
  /** Optional inline style overrides */
  style?: React.CSSProperties
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpriteIcon({
  region: regionKey,
  sheet,
  col,
  row,
  size = 16,
  className,
  tint,
  style,
}: SpriteIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false

    // Resolve the sprite region
    let spriteRegion: SpriteRegion | null = null

    if (regionKey && ALL_REGIONS[regionKey]) {
      spriteRegion = ALL_REGIONS[regionKey]
    } else if (sheet !== undefined && col !== undefined && row !== undefined) {
      const sheetKey =
        sheet === 'tiny-dungeon' ? 'tileset-tiny-dungeon' : 'tileset-tiny-town'
      spriteRegion = {
        sheet: sheetKey,
        x: col * 16,
        y: row * 16,
        width: 16,
        height: 16,
      }
    }

    if (!spriteRegion) return

    const sheetPath = getSheetPath(spriteRegion.sheet)

    loadImage(sheetPath).then((img) => {
      if (cancelled) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // High-DPI: draw at 2x for retina
      const dpr = window.devicePixelRatio || 1
      canvas.width = size * dpr
      canvas.height = size * dpr

      // Pixel-art: no smoothing
      ctx.imageSmoothingEnabled = false

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw the sprite region scaled to fill the canvas
      ctx.drawImage(
        img,
        spriteRegion!.x,
        spriteRegion!.y,
        spriteRegion!.width,
        spriteRegion!.height,
        0,
        0,
        canvas.width,
        canvas.height,
      )

      // Apply tint using 'source-atop' composite
      if (tint) {
        ctx.globalCompositeOperation = 'source-atop'
        ctx.fillStyle = tint
        ctx.globalAlpha = 0.5
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
      }
    })

    return () => {
      cancelled = true
    }
  }, [regionKey, sheet, col, row, size, tint])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{
        display: 'block',
        width: size,
        height: size,
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Semantic Sprite Mappings — maps UI concepts to sprite region keys
// ---------------------------------------------------------------------------

/** Biome key → sprite region key for biome icons */
export const BIOME_ICON_MAP: Record<string, string> = {
  urban: 'wall_brick_tl',      // brick building
  library: 'bookshelf_1',      // bookshelf
  industrial: 'anvil',         // anvil / smithing
  observatory: 'crystal_1',    // crystal / scrying
  arts: 'painting',            // painting
  harbor: 'bridge_h',          // bridge / dock
  civic: 'castle_tl',          // castle
}

/** Agent status → sprite region key for status indicator */
export const STATUS_ICON_MAP: Record<string, string> = {
  active: 'gem_town',          // green gem (we'll tint it)
  idle: 'lantern',             // lantern (warm/idle)
  combat: 'item_sword',        // sword (fighting)
  offline: 'skull',            // skull (dead/offline)
}

/** Building tile state → sprite region key */
export const TILE_STATE_ICON_MAP: Record<string, string> = {
  scaffolding: 'crate',        // wooden crate (construction)
  building: 'hammer_town',     // hammer (in progress)
  complete: 'flag',            // flag (done!)
  ruins: 'bones',              // bones (ruins)
}

/**
 * Resolve a tool ID to a sprite region key.
 * Delegates to EntitySpriteMap (single source of truth for all entity→sprite mappings).
 */
export function resolveToolIcon(toolId: string): string {
  return entitySprites.resolveTool(toolId)
}

/** Scenario selector icons */
export const SCENARIO_ICON_MAP: Record<string, string> = {
  'single-island': 'flag',            // flag (simple task)
  'multi-district': 'item_shield',    // shield (auth)
  'multi-island': 'gem_town',         // gem (shared types)
  'password-reset': 'item_key',       // key
  'incident-bad-env': 'monster_slime', // bug/slime
  research: 'crystal_1',              // crystal (research)
}

/** Follow/target icon */
export const UI_ICON_MAP = {
  target: 'target_board',      // target/bullseye
  chat: 'banner_1',            // banner (speech)
  close: 'cross_grave',        // X mark
} as const
