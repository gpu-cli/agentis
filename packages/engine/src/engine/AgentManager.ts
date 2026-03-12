// ============================================================================
// Agent Manager — Renders agent hero sprites with movement + status
// Uses AssetLoader textures (generated placeholders or real Kenney sprites)
//
// Each agent shows: body sprite, name label, status dot, glow ring,
// and ONE small tool bubble to the right when using a tool.
// No progress bars, no action labels, no filename text on the map.
// ============================================================================

import { Container, Graphics, Sprite, Text, TextStyle, type Texture } from 'pixi.js'
import type { Agent, WorldCoord } from '@multiverse/shared'
import { useAgentStore } from '../stores/agentStore'
import { useUIStore } from '../stores/uiStore'
import { AssetLoader } from './AssetLoader'

const TILE_SIZE = 32
const CHUNK_SIZE = 64
const AGENT_SIZE = 24
const MOVE_SPEED = 2 // pixels per frame
const WALK_ANIM_INTERVAL = 200 // ms per frame
const TOOL_ICON_SIZE = 10

const nameStyle = new TextStyle({
  fontFamily: '"Press Start 2P", monospace',
  fontSize: 7,
  fill: 0xffffff,
  dropShadow: { color: 0x000000, distance: 1, blur: 0 },
})

interface CompletionPulse {
  graphics: Graphics
  startTime: number
  duration: number
}

interface AgentSprite {
  container: Container
  bodySprite: Sprite
  statusDot: Sprite
  nameLabel: Text
  toolIndicator: Sprite | null
  toolBubbleBg: Graphics
  glowRing: Graphics
  targetX: number
  targetY: number
  currentX: number
  currentY: number
  agentType: string
  isMoving: boolean
  walkFrame: number
  lastFrameTime: number
  /** Track the previous active_tool to detect transitions */
  prevActiveTool: string | undefined
  /** Completion pulse effect */
  completionPulse: CompletionPulse | null
  /** Whether the agent has ever been active (non-idle) — used to hide
   *  agents that haven't appeared in the replay yet. Once true, stays true. */
  hasAppeared: boolean
  /** Initial spawn position — used to detect if the agent has moved */
  spawnX: number
  spawnY: number
}

export class AgentManager {
  container: Container
  private sprites: Map<string, AgentSprite> = new Map()
  private unsubscribe: (() => void) | null = null

  constructor() {
    this.container = new Container()
    this.container.label = 'agents'
    this.container.zIndex = 10

    // Subscribe to agent store
    this.unsubscribe = useAgentStore.subscribe(() => {
      this.syncAgents()
    })

    // Initial sync
    this.syncAgents()
  }

  /** Get a unique sprite key for this agent via the shared agent store. */
  private getSpriteKeyForAgent(agentId: string): string {
    return useAgentStore.getState().getOrAssignSprite(agentId)
  }

  private worldToPixel(coord: WorldCoord): { x: number; y: number } {
    return {
      x: (coord.chunk_x * CHUNK_SIZE + coord.local_x) * TILE_SIZE + TILE_SIZE / 2,
      y: (coord.chunk_y * CHUNK_SIZE + coord.local_y) * TILE_SIZE + TILE_SIZE / 2,
    }
  }

  private syncAgents(): void {
    const agents = useAgentStore.getState().agents

    // Add or update sprites for current agents
    for (const agent of agents.values()) {
      let sprite = this.sprites.get(agent.id)
      if (!sprite) {
        sprite = this.createAgentSprite(agent)
        this.sprites.set(agent.id, sprite)
        this.container.addChild(sprite.container)
      }
      this.updateAgentSprite(sprite, agent)
    }

    // Remove sprites for agents no longer present
    for (const [id, sprite] of this.sprites) {
      if (!agents.has(id)) {
        try {
          this.container.removeChild(sprite.container)
          sprite.container.destroy({ children: true })
        } catch {
          // PixiJS may already be torn down during mode switching — safe to ignore
        }
        this.sprites.delete(id)
      }
    }
  }

  private createAgentSprite(agent: Agent): AgentSprite {
    const assets = AssetLoader.instance
    const container = new Container()
    container.label = `agent-${agent.id}`

    // --- Invisible hit area (generous clickable region around the agent) ---
    const hitArea = new Graphics()
    const hitPad = 16
    hitArea.rect(
      -AGENT_SIZE / 2 - hitPad,
      -AGENT_SIZE / 2 - hitPad - 10,
      AGENT_SIZE + hitPad * 2,
      AGENT_SIZE + hitPad * 2 + 10,
    )
    hitArea.fill({ color: 0xffffff, alpha: 0.001 })
    container.addChild(hitArea)

    // Body — use a unique sprite from the pool for each agent instance
    const spriteKey = this.getSpriteKeyForAgent(agent.id)
    const bodyTex = assets.getAgentTexture(spriteKey)
    const bodySprite = new Sprite(bodyTex)
    bodySprite.anchor.set(0.5)
    bodySprite.width = AGENT_SIZE
    bodySprite.height = AGENT_SIZE
    container.addChild(bodySprite)

    // Shadow underneath
    const shadow = new Graphics()
    shadow.ellipse(0, AGENT_SIZE / 2 - 2, AGENT_SIZE / 3, 4)
    shadow.fill({ color: 0x000000, alpha: 0.2 })
    container.addChildAt(shadow, 1) // after hitArea, before body

    // Glow ring — visible when selected or active
    const glowRing = new Graphics()
    glowRing.visible = false
    container.addChildAt(glowRing, 1) // behind shadow + body

    // Status dot — use texture
    const statusTex = assets.getStatusDotTexture(agent.status)
    const statusDot = new Sprite(statusTex)
    statusDot.anchor.set(0.5)
    statusDot.x = AGENT_SIZE / 2 - 2
    statusDot.y = -AGENT_SIZE / 2 + 2
    statusDot.width = 8
    statusDot.height = 8
    container.addChild(statusDot)

    // Name label above
    const nameLabel = new Text({ text: agent.name, style: nameStyle })
    nameLabel.anchor.set(0.5, 1)
    nameLabel.y = -AGENT_SIZE / 2 - 6
    container.addChild(nameLabel)

    // Tool bubble background (dark circle behind tool icon)
    const toolBubbleBg = new Graphics()
    toolBubbleBg.circle(0, 0, 8)
    toolBubbleBg.fill({ color: 0x111111, alpha: 0.7 })
    toolBubbleBg.visible = false
    container.addChild(toolBubbleBg)

    const pos = this.worldToPixel(agent.position)

    // Make clickable
    container.eventMode = 'static'
    container.cursor = 'pointer'
    container.on('pointerdown', (e) => {
      e.stopPropagation()
      useUIStore.getState().selectEntity(agent.id, 'agent')
    })

    // Agents start hidden — they only appear once the replay drives an actual
    // position change, tool use, or status update via updateAgentSprite().
    // This prevents snapshot-loaded agents (which may already have status 'active')
    // from appearing at their spawn positions before any replay events arrive.
    container.visible = false

    return {
      container,
      bodySprite,
      statusDot,
      nameLabel,
      toolIndicator: null,
      toolBubbleBg,
      glowRing,
      targetX: pos.x,
      targetY: pos.y,
      currentX: pos.x,
      currentY: pos.y,
      agentType: spriteKey,
      isMoving: false,
      walkFrame: 0,
      lastFrameTime: Date.now(),
      prevActiveTool: undefined,
      completionPulse: null,
      hasAppeared: false,
      spawnX: pos.x,
      spawnY: pos.y,
    }
  }

  private updateAgentSprite(sprite: AgentSprite, agent: Agent): void {
    const assets = AssetLoader.instance
    const pos = this.worldToPixel(agent.position)
    sprite.targetX = pos.x
    sprite.targetY = pos.y

    // Reveal the agent only once a replay event actually changes it — a tool
    // assignment or a position change from the spawn point.  We deliberately
    // ignore `agent.status` here because snapshot-loaded agents may already
    // have status 'active' before any replay events have fired.
    if (!sprite.hasAppeared) {
      const hasMoved = Math.abs(pos.x - sprite.spawnX) > 2 || Math.abs(pos.y - sprite.spawnY) > 2
      const hasTool = !!agent.active_tool
      if (hasMoved || hasTool) {
        sprite.hasAppeared = true
        sprite.container.visible = true
      }
    }

    // Update status dot texture
    const statusTex = assets.getStatusDotTexture(agent.status)
    sprite.statusDot.texture = statusTex

    // Update active tool indicator — single bubble to the right of agent
    const toolX = AGENT_SIZE / 2 + 6
    const toolY = -4

    if (agent.active_tool) {
      const toolTex: Texture = assets.getToolTexture(agent.active_tool)
      if (!sprite.toolIndicator) {
        sprite.toolIndicator = new Sprite(toolTex)
        sprite.toolIndicator.anchor.set(0.5)
        sprite.toolIndicator.width = TOOL_ICON_SIZE
        sprite.toolIndicator.height = TOOL_ICON_SIZE
        sprite.container.addChild(sprite.toolIndicator)
      } else {
        sprite.toolIndicator.texture = toolTex
      }
      sprite.toolIndicator.x = toolX
      sprite.toolIndicator.y = toolY
      sprite.toolIndicator.visible = true

      // Show bubble background
      sprite.toolBubbleBg.x = toolX
      sprite.toolBubbleBg.y = toolY
      sprite.toolBubbleBg.visible = true
    } else {
      if (sprite.toolIndicator) {
        sprite.toolIndicator.visible = false
      }
      sprite.toolBubbleBg.visible = false
    }
    sprite.prevActiveTool = agent.active_tool
  }

  /** Draw / update the glow ring graphics for an agent sprite */
  private updateGlowRing(
    sprite: AgentSprite,
    isSelected: boolean,
    isActive: boolean,
    now: number,
  ): void {
    // Show glow only for selected or active agents
    const showGlow = isSelected || isActive
    sprite.glowRing.visible = showGlow
    if (!showGlow) return

    // Redraw each frame for the pulse animation
    sprite.glowRing.clear()

    // Pulse: oscillate between 0.6 and 1.0 over ~1.5s
    const pulse = 0.8 + Math.sin(now * 0.004) * 0.2

    if (isSelected) {
      // Selected: bright, larger glow with multiple rings
      const baseRadius = AGENT_SIZE * 0.9
      const color = 0x4af0ff // cyan-ish selection glow

      // Outer soft glow
      sprite.glowRing.circle(0, 0, baseRadius * 1.4 * pulse)
      sprite.glowRing.fill({ color, alpha: 0.06 * pulse })

      // Mid ring
      sprite.glowRing.circle(0, 0, baseRadius * 1.15 * pulse)
      sprite.glowRing.fill({ color, alpha: 0.1 * pulse })

      // Core ring (stroke only — crisp edge)
      sprite.glowRing.circle(0, 0, baseRadius * pulse)
      sprite.glowRing.stroke({ color, alpha: 0.5 * pulse, width: 2 })

      // Inner bright ring
      sprite.glowRing.circle(0, 0, baseRadius * 0.85 * pulse)
      sprite.glowRing.stroke({ color: 0xffffff, alpha: 0.15 * pulse, width: 1 })
    } else {
      // Active (not selected): subtler warm glow
      const baseRadius = AGENT_SIZE * 0.72
      const color = 0xffd700 // gold for active

      // Outer soft glow
      sprite.glowRing.circle(0, 0, baseRadius * 1.2 * pulse)
      sprite.glowRing.fill({ color, alpha: 0.05 * pulse })

      // Core ring
      sprite.glowRing.circle(0, 0, baseRadius * pulse)
      sprite.glowRing.stroke({ color, alpha: 0.35 * pulse, width: 1.5 })
    }
  }

  /** Play a brief expanding green ring when an agent completes something */
  playCompletionPulse(agentId: string): void {
    const sprite = this.sprites.get(agentId)
    if (!sprite) return

    // Clean up existing pulse if any
    if (sprite.completionPulse) {
      sprite.container.removeChild(sprite.completionPulse.graphics)
      sprite.completionPulse.graphics.destroy()
    }

    const g = new Graphics()
    sprite.container.addChildAt(g, 1) // behind body, above hit area

    sprite.completionPulse = {
      graphics: g,
      startTime: Date.now(),
      duration: 1000,
    }
  }

  /** Call each frame — handles smooth movement interpolation + walk animation */
  update(): void {
    const assets = AssetLoader.instance
    const now = Date.now()
    const { selectedEntityId, selectedEntityType } = useUIStore.getState()

    for (const [agentId, sprite] of this.sprites) {
      // Lerp towards target position
      const dx = sprite.targetX - sprite.currentX
      const dy = sprite.targetY - sprite.currentY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > 1) {
        sprite.isMoving = true
        const step = Math.min(MOVE_SPEED, dist)
        sprite.currentX += (dx / dist) * step
        sprite.currentY += (dy / dist) * step

        // Walk animation — cycle through frames
        if (now - sprite.lastFrameTime > WALK_ANIM_INTERVAL) {
          sprite.walkFrame = (sprite.walkFrame + 1) % 4
          sprite.lastFrameTime = now
          const frameTex = assets.getAgentTexture(sprite.agentType, sprite.walkFrame)
          sprite.bodySprite.texture = frameTex
        }

        // Direction facing — flip sprite
        if (dx < -1) {
          sprite.bodySprite.scale.x = -Math.abs(sprite.bodySprite.scale.x)
        } else if (dx > 1) {
          sprite.bodySprite.scale.x = Math.abs(sprite.bodySprite.scale.x)
        }
      } else {
        if (sprite.isMoving) {
          // Just stopped — reset to idle frame
          sprite.isMoving = false
          sprite.bodySprite.texture = assets.getAgentTexture(sprite.agentType)
          sprite.bodySprite.scale.x = Math.abs(sprite.bodySprite.scale.x)
        }
        sprite.currentX = sprite.targetX
        sprite.currentY = sprite.targetY
        sprite.bodySprite.y = 0
      }

      sprite.container.x = sprite.currentX
      sprite.container.y = sprite.currentY

      // Update glow ring based on selection / activity state
      const isSelected = selectedEntityType === 'agent' && selectedEntityId === agentId
      const agentData = useAgentStore.getState().agents.get(agentId)
      const isActive = agentData ? agentData.status !== 'idle' : false
      this.updateGlowRing(sprite, isSelected, isActive, now)

      // Update tool icon bob per frame
      if (sprite.toolIndicator?.visible) {
        const bobFrame = Math.floor(now / 250) % 2
        const toolY = -4 + (bobFrame === 0 ? -1 : 1)
        sprite.toolIndicator.y = toolY
        sprite.toolBubbleBg.y = toolY
      }

      // Update completion pulse
      if (sprite.completionPulse) {
        const elapsed = now - sprite.completionPulse.startTime
        const progress = elapsed / sprite.completionPulse.duration

        if (progress >= 1) {
          sprite.container.removeChild(sprite.completionPulse.graphics)
          sprite.completionPulse.graphics.destroy()
          sprite.completionPulse = null
        } else {
          const g = sprite.completionPulse.graphics
          g.clear()
          const radius = AGENT_SIZE * 0.8 + (AGENT_SIZE * 1.0) * progress
          const alpha = 0.6 * (1 - progress)
          g.circle(0, 0, radius)
          g.stroke({ color: 0x27ae60, alpha, width: 2.5 })
        }
      }
    }

    // Update follow camera if needed
    const followId = useUIStore.getState().followAgentId
    if (followId) {
      const sprite = this.sprites.get(followId)
      if (sprite) {
        this._followPosition = { x: sprite.currentX, y: sprite.currentY }
      }
    }
  }

  // Expose follow position for WorldRenderer to use
  _followPosition: { x: number; y: number } | null = null

  /** V4: Direct target position update from worker diffs — bypasses store */
  updateTargetFromDiff(agentId: string, x: number, y: number): void {
    const sprite = this.sprites.get(agentId)
    if (sprite) {
      sprite.targetX = x
      sprite.targetY = y
    }
  }

  getAgentPosition(agentId: string): { x: number; y: number } | null {
    const sprite = this.sprites.get(agentId)
    return sprite ? { x: sprite.currentX, y: sprite.currentY } : null
  }

  /** Get interpolated pixel positions for visible (appeared) agents only.
   *  Agents that haven't appeared yet are excluded so fog-of-war doesn't
   *  draw reveal circles at their spawn positions. */
  getAllAgentPositions(): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>()
    for (const [id, sprite] of this.sprites) {
      if (sprite.hasAppeared) {
        positions.set(id, { x: sprite.currentX, y: sprite.currentY })
      }
    }
    return positions
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
    this._followPosition = null
  }

  destroy(): void {
    this.unsubscribe?.()
    try {
      this.container.destroy({ children: true })
    } catch {
      // PixiJS may already be torn down — safe to ignore
    }
    this.sprites.clear()
  }
}
