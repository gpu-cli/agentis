// ============================================================================
// Monster Manager — Renders error/incident monsters on the world map
//
// Monsters scale visually by severity:
//   warning  (slime)    → 24×24
//   error    (skeleton) → 36×36
//   critical (golem)    → 48×48
//   outage   (dragon)   → 64×64
//
// Each monster shows: sprite, health bar, pulsing red/orange aura.
// Defeated monsters fade out over 2 seconds then are removed.
// ============================================================================

import { Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js'
import type { Monster, MonsterSeverity } from '@multiverse/shared'
import { useMonsterStore } from '../stores/monsterStore'
import { useUIStore } from '../stores/uiStore'
import { AssetLoader } from './AssetLoader'

const TILE_SIZE = 32
const CHUNK_SIZE = 64

/** Pixel size per severity level — always at least as big as agents (24px) */
const SEVERITY_SIZES: Record<MonsterSeverity, number> = {
  warning: 32,
  error: 48,
  critical: 64,
  outage: 80,
}

/** Aura color per severity */
const SEVERITY_AURA_COLORS: Record<MonsterSeverity, number> = {
  warning: 0xf39c12,  // amber
  error: 0xe74c3c,    // red
  critical: 0xff2222,  // bright red
  outage: 0xff0000,    // intense red
}

const HEALTH_BAR_H = 3
const DEFEATED_FADE_MS = 2000

const nameStyle = new TextStyle({
  fontFamily: '"Press Start 2P", monospace',
  fontSize: 5,
  fill: 0xff6666,
  dropShadow: { color: 0x000000, distance: 1, blur: 0 },
})

interface MonsterSprite {
  container: Container
  bodySprite: Sprite
  healthBarBg: Graphics
  healthBarFill: Graphics
  auraRing: Graphics
  nameLabel: Text
  severity: MonsterSeverity
  size: number
  defeatedAt: number | null
}

export class MonsterManager {
  container: Container
  private sprites: Map<string, MonsterSprite> = new Map()
  private unsubscribe: (() => void) | null = null

  constructor() {
    this.container = new Container()
    this.container.label = 'monsters'
    this.container.zIndex = 43

    this.unsubscribe = useMonsterStore.subscribe(() => {
      this.syncMonsters()
    })

    // Initial sync
    this.syncMonsters()
  }

  private worldToPixel(coord: { chunk_x: number; chunk_y: number; local_x: number; local_y: number }): { x: number; y: number } {
    return {
      x: (coord.chunk_x * CHUNK_SIZE + coord.local_x) * TILE_SIZE + TILE_SIZE / 2,
      y: (coord.chunk_y * CHUNK_SIZE + coord.local_y) * TILE_SIZE + TILE_SIZE / 2,
    }
  }

  private syncMonsters(): void {
    const monsters = useMonsterStore.getState().monsters

    for (const monster of monsters.values()) {
      let sprite = this.sprites.get(monster.id)
      if (!sprite) {
        // Never create sprites for already-defeated monsters (prevents resurrection)
        if (monster.status === 'defeated') continue
        sprite = this.createMonsterSprite(monster)
        this.sprites.set(monster.id, sprite)
        this.container.addChild(sprite.container)
      }
      this.updateMonsterSprite(sprite, monster)
    }

    // Remove sprites for monsters no longer in store
    for (const [id, sprite] of this.sprites) {
      if (!monsters.has(id)) {
        this.container.removeChild(sprite.container)
        sprite.container.destroy({ children: true })
        this.sprites.delete(id)
      }
    }
  }

  private createMonsterSprite(monster: Monster): MonsterSprite {
    const assets = AssetLoader.instance
    const container = new Container()
    container.label = `monster-${monster.id}`

    const size = SEVERITY_SIZES[monster.severity] ?? 24

    // Aura ring (behind everything)
    const auraRing = new Graphics()
    auraRing.visible = true
    container.addChild(auraRing)

    // Body sprite
    const bodyTex = assets.getMonsterTexture(monster.monster_type)
    const bodySprite = new Sprite(bodyTex)
    bodySprite.anchor.set(0.5)
    bodySprite.width = size
    bodySprite.height = size
    container.addChild(bodySprite)

    // Name label above — show severity, not the raw error message
    const FRIENDLY_LABELS: Record<string, string> = {
      warning: 'Warning',
      error: 'Error',
      critical: 'Critical',
      outage: 'Outage',
    }
    const label = FRIENDLY_LABELS[monster.severity] ?? 'Error'
    const shortLabel = label.length > 20 ? label.slice(0, 19) + '…' : label
    const nameLabel = new Text({ text: shortLabel, style: nameStyle })
    nameLabel.anchor.set(0.5, 1)
    nameLabel.y = -size / 2 - 4
    container.addChild(nameLabel)

    // Health bar background
    const healthBarW = Math.max(16, size * 0.8)
    const healthBarBg = new Graphics()
    healthBarBg.rect(-healthBarW / 2, size / 2 + 3, healthBarW, HEALTH_BAR_H)
    healthBarBg.fill({ color: 0x111111, alpha: 0.7 })
    container.addChild(healthBarBg)

    // Health bar fill
    const healthBarFill = new Graphics()
    container.addChild(healthBarFill)

    // Position
    const pos = this.worldToPixel(monster.position)
    container.x = pos.x
    container.y = pos.y

    // Make clickable
    container.eventMode = 'static'
    container.cursor = 'pointer'
    container.on('pointerdown', (e) => {
      e.stopPropagation()
      useUIStore.getState().selectEntity(monster.id, 'monster')
    })

    return {
      container,
      bodySprite,
      healthBarBg,
      healthBarFill,
      auraRing,
      nameLabel,
      severity: monster.severity,
      size,
      defeatedAt: null,
    }
  }

  private updateMonsterSprite(sprite: MonsterSprite, monster: Monster): void {
    // Update position
    const pos = this.worldToPixel(monster.position)
    sprite.container.x = pos.x
    sprite.container.y = pos.y

    // Track defeated time
    if (monster.status === 'defeated' && !sprite.defeatedAt) {
      sprite.defeatedAt = Date.now()
    }

    // Update health bar
    const healthBarW = Math.max(16, sprite.size * 0.8)
    sprite.healthBarFill.clear()
    const fillW = healthBarW * (monster.health / 100)
    const healthColor = monster.health > 50 ? 0xe74c3c : monster.health > 25 ? 0xf39c12 : 0xff0000
    sprite.healthBarFill.rect(-healthBarW / 2, sprite.size / 2 + 3, fillW, HEALTH_BAR_H)
    sprite.healthBarFill.fill({ color: healthColor, alpha: 0.8 })

    // Hide health bar if defeated
    if (monster.status === 'defeated') {
      sprite.healthBarBg.visible = false
      sprite.healthBarFill.visible = false
    }
  }

  update(): void {
    const now = Date.now()
    const toRemove: string[] = []

    for (const [id, sprite] of this.sprites) {
      // Pulsing aura
      if (!sprite.defeatedAt) {
        const auraColor = SEVERITY_AURA_COLORS[sprite.severity] ?? 0xe74c3c
        const pulse = 0.8 + Math.sin(now * 0.005) * 0.2
        const auraRadius = sprite.size * 0.7 * pulse

        sprite.auraRing.clear()
        sprite.auraRing.circle(0, 0, auraRadius * 1.3)
        sprite.auraRing.fill({ color: auraColor, alpha: 0.06 * pulse })
        sprite.auraRing.circle(0, 0, auraRadius)
        sprite.auraRing.stroke({ color: auraColor, alpha: 0.25 * pulse, width: 1.5 })
      }

      // Defeated fade-out
      if (sprite.defeatedAt) {
        const elapsed = now - sprite.defeatedAt
        if (elapsed >= DEFEATED_FADE_MS) {
          toRemove.push(id)
        } else {
          sprite.container.alpha = 1 - elapsed / DEFEATED_FADE_MS
          sprite.auraRing.visible = false
        }
      }
    }

    // Remove fully faded monsters
    for (const id of toRemove) {
      const sprite = this.sprites.get(id)
      if (sprite) {
        this.container.removeChild(sprite.container)
        sprite.container.destroy({ children: true })
        this.sprites.delete(id)
      }
    }
  }

  /** Clear all sprites so the next store sync recreates from fresh state */
  reset(): void {
    for (const sprite of this.sprites.values()) {
      try {
        this.container.removeChild(sprite.container)
        sprite.container.destroy({ children: true })
      } catch {
        // PixiJS may already be torn down — safe to ignore
      }
    }
    this.sprites.clear()
  }

  destroy(): void {
    this.unsubscribe?.()
    this.container.destroy({ children: true })
    this.sprites.clear()
  }
}
