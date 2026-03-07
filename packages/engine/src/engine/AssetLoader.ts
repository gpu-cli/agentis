// ============================================================================
// Asset Loader — Centralized sprite sheet loading + placeholder generation
//
// Strategy:
// 1. Try to load real Kenney sprite sheets from /assets/
// 2. If not found, generate placeholder textures (colored shapes)
// 3. All textures use NEAREST scale mode (pixel art, no smoothing)
//
// Usage:
//   const assets = AssetLoader.instance
//   await assets.init(app.renderer)
//   const tex = assets.getAgentTexture('claude')
// ============================================================================

import { Assets, Graphics, Rectangle, Texture, RenderTexture, type Renderer } from 'pixi.js'
import {
  AGENT_COLORS,
  BIOME_COLORS,
  TILE_STATE_COLORS,
  TOOL_COLORS,
  TOOL_SYMBOLS,
  MONSTER_COLORS,
  STATUS_COLORS,
  BIOME_GROUND_TYPES,
  ASSET_PATHS,
  TINY_TOWN_REGIONS,
  TINY_DUNGEON_REGIONS,
  BIOME_BUILDING_SPRITES,
  BIOME_GROUND_SPRITES,
  TILE_STATE_SPRITES,
  WORKITEM_ICON_PATHS,
  PARTICLE_PATHS,
  type SpriteRegion,
} from './SpriteConfig'
import { spriteAtlas } from './SpriteAtlasRegistry'
import { entitySprites } from './entity-sprite-map'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TextureCache {
  agents: Map<string, Texture>
  agentFrames: Map<string, Texture[]>   // agentType → [frame0, frame1, ...]
  buildings: Map<string, Texture[]>     // biome → [variant0, variant1, ...]
  tiles: Map<string, Texture>           // tileState → Texture
  tools: Map<string, Texture>           // toolId → Texture
  monsters: Map<string, Texture>        // monsterType → Texture
  monsterFrames: Map<string, Texture[]>
  particles: Map<string, Texture>
  biomeTiles: Map<string, Map<string, Texture>> // biome → tileType → Texture
  statusDots: Map<string, Texture>
  workItemIcons: Map<string, Texture>
  roadTiles: Map<string, Texture>       // road tile key → Texture (path_1, cobble_1, etc.)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TILE_PX = 32    // Rendered tile size
const SPRITE_PX = 24  // Agent sprite size
const TOOL_PX = 16    // Tool icon size
const MONSTER_SIZES: Record<string, number> = {
  slime: 24,
  skeleton: 36,
  golem: 48,
  dragon: 64,
}

// Walk animation: 4 frames of slight positional offset (rendered at init)
const WALK_FRAMES = 4

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export class AssetLoader {
  private static _instance: AssetLoader | null = null

  static get instance(): AssetLoader {
    if (!this._instance) {
      this._instance = new AssetLoader()
    }
    return this._instance
  }

  // State
  private renderer: Renderer | null = null
  private cache: TextureCache = {
    agents: new Map(),
    agentFrames: new Map(),
    buildings: new Map(),
    tiles: new Map(),
    tools: new Map(),
    monsters: new Map(),
    monsterFrames: new Map(),
    particles: new Map(),
    biomeTiles: new Map(),
    statusDots: new Map(),
    workItemIcons: new Map(),
    roadTiles: new Map(),
  }

  isLoaded = false
  loadProgress = 0
  private _realAssetsAvailable = false

  // Loaded tilemap base textures (used for cropping regions)
  private tinyTownSheet: Texture | null = null
  private tinyDungeonSheet: Texture | null = null

  private constructor() {}

  // =========================================================================
  // Initialization
  // =========================================================================

  async init(renderer: Renderer): Promise<void> {
    // Always regenerate textures if the renderer changed (React strict mode
    // destroys the first renderer, invalidating all RenderTextures).
    if (this.isLoaded && this.renderer === renderer) return
    this.renderer = renderer
    this.isLoaded = false
    this.loadProgress = 0.1

    // Clear stale caches from previous renderer
    this.clearCaches()

    this.loadProgress = 0.15

    // Try loading real Kenney assets
    try {
      await this.loadRealAssets()
      this._realAssetsAvailable = true
      console.log('[AssetLoader] Real Kenney sprite sheets loaded successfully')
    } catch (err) {
      console.warn('[AssetLoader] Could not load real assets, using placeholders:', err)
      this._realAssetsAvailable = false
      this.generatePlaceholders()
    }

    this.loadProgress = 1.0
    this.isLoaded = true
  }

  /** Expose the active Pixi renderer (read-only) for render-to-texture use cases. */
  getRenderer(): Renderer | null {
    return this.renderer
  }

  private clearCaches(): void {
    this.cache.agents.clear()
    this.cache.agentFrames.clear()
    this.cache.buildings.clear()
    this.cache.tiles.clear()
    this.cache.tools.clear()
    this.cache.monsters.clear()
    this.cache.monsterFrames.clear()
    this.cache.particles.clear()
    this.cache.biomeTiles.clear()
    this.cache.statusDots.clear()
    this.cache.workItemIcons.clear()
    this.cache.roadTiles.clear()
  }

  // =========================================================================
  // Real Asset Loading (Kenney CC0 sprite sheets)
  // =========================================================================

  private async loadRealAssets(): Promise<void> {
    this.loadProgress = 0.2

    // --- Load tilemap sprite sheets ---
    const [townTex, dungeonTex] = await Promise.all([
      Assets.load<Texture>(ASSET_PATHS.TINY_TOWN),
      Assets.load<Texture>(ASSET_PATHS.TINY_DUNGEON),
    ])

    // Set NEAREST scaling on the source textures
    townTex.source.scaleMode = 'nearest'
    dungeonTex.source.scaleMode = 'nearest'

    this.tinyTownSheet = townTex
    this.tinyDungeonSheet = dungeonTex

    this.loadProgress = 0.35

    // --- Crop agent textures from Tiny Dungeon ---
    this.loadAgentSprites()
    this.loadProgress = 0.45

    // --- Crop monster textures ---
    this.loadMonsterSprites()
    this.loadProgress = 0.55

    // --- Crop building textures from Tiny Town ---
    this.loadBuildingSprites()
    this.loadProgress = 0.6

    // --- Crop tile state textures ---
    this.loadTileStateSprites()
    this.loadProgress = 0.65

    // --- Crop tool item textures ---
    this.loadToolSprites()
    this.loadProgress = 0.7

    // --- Crop biome ground tiles ---
    this.loadBiomeGroundSprites()
    this.loadProgress = 0.73

    // --- Crop road/path tiles ---
    this.loadRoadTileSprites()
    this.loadProgress = 0.75

    // --- Load particle textures (individual PNGs) ---
    await this.loadParticleTextures()
    this.loadProgress = 0.82

    // --- Load work item icon textures ---
    await this.loadWorkItemIcons()
    this.loadProgress = 0.88

    // --- Generate status dots (simple colored circles — keep generated) ---
    this.generateStatusDots()
    this.loadProgress = 0.92

    // --- Initialize SpriteAtlasV2 registry (role-based texture resolution) ---
    try {
      await spriteAtlas.init()
      if (spriteAtlas.isReady) {
        console.log('[AssetLoader] SpriteAtlasV2 registry initialized')
      }
    } catch (err) {
      console.warn('[AssetLoader] SpriteAtlasV2 registry failed to init (non-fatal):', err)
    }
    this.loadProgress = 0.93

    // --- Initialize EntitySpriteMap (entity→sprite semantic resolver) ---
    try {
      await entitySprites.init()
      if (entitySprites.isReady) {
        console.log('[AssetLoader] EntitySpriteMap initialized')
      }
    } catch (err) {
      console.warn('[AssetLoader] EntitySpriteMap failed to init (non-fatal):', err)
    }
    this.loadProgress = 0.95
  }

  /** Crop a sub-region from a tilemap texture */
  private cropRegion(region: SpriteRegion): Texture {
    const baseTexture = region.sheet.includes('town')
      ? this.tinyTownSheet
      : this.tinyDungeonSheet

    if (!baseTexture) return Texture.WHITE

    const frame = new Rectangle(region.x, region.y, region.width, region.height)
    const tex = new Texture({ source: baseTexture.source, frame })
    tex.source.scaleMode = 'nearest'
    return tex
  }

  /** Look up a region by key from either tileset's regions */
  private getRegion(key: string): SpriteRegion | null {
    const townRegion = (TINY_TOWN_REGIONS as Record<string, SpriteRegion>)[key]
    if (townRegion) return townRegion
    const dungeonRegion = (TINY_DUNGEON_REGIONS as Record<string, SpriteRegion>)[key]
    if (dungeonRegion) return dungeonRegion
    return null
  }

  // --- Agents ---

  private loadAgentSprites(): void {
    // Load base sprites for each known agent type (e.g., claude → hero_knight)
    const agentTypeMap = entitySprites.getAgentTypeMap()
    for (const [agentType, spriteKey] of Object.entries(agentTypeMap)) {
      const region = this.getRegion(spriteKey)
      if (!region) continue

      const tex = this.cropRegion(region)
      this.cache.agents.set(agentType, tex)

      // Walk frames — Tiny Dungeon tiles are single 16×16 sprites, the
      // AgentManager provides bobbing/offset animation programmatically
      const frames: Texture[] = []
      for (let f = 0; f < WALK_FRAMES; f++) {
        frames.push(this.cropRegion(region))
      }
      this.cache.agentFrames.set(agentType, frames)
    }

    // Also preload every variant sprite key (for deterministic assignment)
    for (const spriteKey of entitySprites.getAllAgentSpriteKeys()) {
      if (this.cache.agents.has(spriteKey)) continue
      const region = this.getRegion(spriteKey)
      if (!region) continue

      this.cache.agents.set(spriteKey, this.cropRegion(region))
      const frames: Texture[] = []
      for (let f = 0; f < WALK_FRAMES; f++) {
        frames.push(this.cropRegion(region))
      }
      this.cache.agentFrames.set(spriteKey, frames)
    }
  }

  // --- Monsters ---

  private loadMonsterSprites(): void {
    const monsterMap = entitySprites.getMonsterSpriteMap()
    for (const [monsterType, spriteKey] of Object.entries(monsterMap)) {
      const region = this.getRegion(spriteKey)
      if (!region) continue

      // Static sprite
      this.cache.monsters.set(monsterType, this.cropRegion(region))

      // 2-frame animation — use same texture (wobble is positional)
      const frames: Texture[] = [
        this.cropRegion(region),
        this.cropRegion(region),
      ]
      this.cache.monsterFrames.set(monsterType, frames)
    }
  }

  // --- Buildings ---

  private loadBuildingSprites(): void {
    for (const [biome, spriteKeys] of Object.entries(BIOME_BUILDING_SPRITES)) {
      const variants: Texture[] = []
      for (const key of spriteKeys) {
        const region = this.getRegion(key)
        if (region) {
          variants.push(this.cropRegion(region))
        }
      }
      if (variants.length > 0) {
        this.cache.buildings.set(biome, variants)
      }
    }
  }

  // --- Tile States ---

  private loadTileStateSprites(): void {
    for (const [state, spriteKey] of Object.entries(TILE_STATE_SPRITES)) {
      const region = this.getRegion(spriteKey)
      if (region) {
        this.cache.tiles.set(state, this.cropRegion(region))
      }
    }
  }

  // --- Tools ---

  private loadToolSprites(): void {
    const toolMap = entitySprites.getToolMap()
    for (const [toolId, spriteKey] of Object.entries(toolMap)) {
      const region = this.getRegion(spriteKey)
      if (region) {
        this.cache.tools.set(toolId, this.cropRegion(region))
      }
    }
  }

  // --- Biome Ground Tiles ---

  private loadBiomeGroundSprites(): void {
    for (const [biome, tileTypes] of Object.entries(BIOME_GROUND_TYPES)) {
      const tileMap = new Map<string, Texture>()
      const spriteMapping = BIOME_GROUND_SPRITES[biome]
      if (!spriteMapping) continue

      for (const tileType of tileTypes) {
        const spriteKey = spriteMapping[tileType]
        if (!spriteKey) continue

        const region = this.getRegion(spriteKey)
        if (region) {
          tileMap.set(tileType, this.cropRegion(region))
        }
      }

      if (tileMap.size > 0) {
        this.cache.biomeTiles.set(biome, tileMap)
      }
    }
  }

  // --- Road / path tiles (from Tiny Town) ---

  private loadRoadTileSprites(): void {
    const roadKeys = [
      'path_1', 'path_2', 'path_3', 'path_4',
      'cobble_1', 'cobble_2', 'cobble_3', 'cobble_4',
    ]
    for (const key of roadKeys) {
      const region = this.getRegion(key)
      if (region) {
        this.cache.roadTiles.set(key, this.cropRegion(region))
      }
    }
  }

  // --- Particles (individual PNGs) ---

  private async loadParticleTextures(): Promise<void> {
    const entries = Object.entries(PARTICLE_PATHS)
    const results = await Promise.allSettled(
      entries.map(([, path]) => Assets.load<Texture>(path))
    )

    for (let i = 0; i < entries.length; i++) {
      const [name] = entries[i]!
      const result = results[i]!
      if (result.status === 'fulfilled' && result.value) {
        result.value.source.scaleMode = 'nearest'
        this.cache.particles.set(name!, result.value)
      }
    }

    // If some particles failed, generate fallbacks for missing ones
    if (this.cache.particles.size < entries.length) {
      this.generateMissingParticles()
    }
  }

  private generateMissingParticles(): void {
    if (!this.renderer) return
    const defaults: Record<string, () => Graphics> = {
      circle: () => { const g = new Graphics(); g.circle(4, 4, 4); g.fill({ color: 0xffffff, alpha: 0.8 }); return g },
      spark: () => { const g = new Graphics(); g.star(6, 6, 4, 6, 2); g.fill({ color: 0xffd700, alpha: 0.9 }); return g },
      smoke: () => { const g = new Graphics(); g.circle(8, 8, 8); g.fill({ color: 0x888888, alpha: 0.4 }); return g },
      trail: () => { const g = new Graphics(); g.ellipse(4, 2, 4, 2); g.fill({ color: 0xffffff, alpha: 0.5 }); return g },
    }
    for (const [name, factory] of Object.entries(defaults)) {
      if (!this.cache.particles.has(name)) {
        const g = factory()
        const size = name === 'smoke' ? 16 : name === 'spark' ? 12 : name === 'trail' ? 8 : 8
        const h = name === 'trail' ? 4 : size
        this.cache.particles.set(name, this.graphicsToTexture(g, size, h))
      }
    }
  }

  // --- Work Item Icons (individual PNGs) ---

  private async loadWorkItemIcons(): Promise<void> {
    const entries = Object.entries(WORKITEM_ICON_PATHS)
    const results = await Promise.allSettled(
      entries.map(([, path]) => Assets.load<Texture>(path))
    )

    for (let i = 0; i < entries.length; i++) {
      const [status] = entries[i]!
      const result = results[i]!
      if (result.status === 'fulfilled' && result.value) {
        result.value.source.scaleMode = 'nearest'
        this.cache.workItemIcons.set(status!, result.value)
      }
    }

    // Generate fallbacks for missing icons
    if (this.cache.workItemIcons.size < entries.length) {
      this.generateMissingWorkItemIcons()
    }
  }

  private generateMissingWorkItemIcons(): void {
    if (!this.renderer) return
    const icons: Record<string, { color: number }> = {
      queued: { color: 0xf39c12 },
      active: { color: 0x3498db },
      blocked: { color: 0xe74c3c },
      done: { color: 0x27ae60 },
    }
    for (const [status, { color }] of Object.entries(icons)) {
      if (!this.cache.workItemIcons.has(status)) {
        const g = new Graphics()
        const s = 12
        g.moveTo(s, 0)
        g.lineTo(s * 2, s)
        g.lineTo(s, s * 2)
        g.lineTo(0, s)
        g.closePath()
        g.fill({ color, alpha: 0.7 })
        g.stroke({ color: 0xffffff, alpha: 0.5, width: 1 })
        this.cache.workItemIcons.set(status, this.graphicsToTexture(g, s * 2, s * 2))
      }
    }
  }

  // =========================================================================
  // Placeholder Generation (fallback when real assets not available)
  // =========================================================================

  private generatePlaceholders(): void {
    this.generateAgentPlaceholders()
    this.loadProgress = 0.35
    this.generateBuildingPlaceholders()
    this.loadProgress = 0.45
    this.generateTilePlaceholders()
    this.loadProgress = 0.55
    this.generateToolPlaceholders()
    this.loadProgress = 0.65
    this.generateMonsterPlaceholders()
    this.loadProgress = 0.75
    this.generateBiomeTilePlaceholders()
    this.loadProgress = 0.85
    this.generateStatusDots()
    this.generateWorkItemIconPlaceholders()
    this.generateParticlePlaceholders()
    this.loadProgress = 0.95
  }

  // -- Agents ---------------------------------------------------------------

  private generateAgentPlaceholders(): void {
    for (const [type, color] of Object.entries(AGENT_COLORS)) {
      // Static sprite
      const g = new Graphics()
      g.circle(SPRITE_PX / 2, SPRITE_PX / 2, SPRITE_PX / 2 - 2)
      g.fill({ color, alpha: 0.9 })
      g.stroke({ color: 0xffffff, alpha: 0.5, width: 2 })
      const tex = this.graphicsToTexture(g, SPRITE_PX, SPRITE_PX)
      this.cache.agents.set(type, tex)

      // Walk frames
      const frames: Texture[] = []
      for (let f = 0; f < WALK_FRAMES; f++) {
        const fg = new Graphics()
        const bobY = Math.sin((f / WALK_FRAMES) * Math.PI * 2) * 2
        fg.circle(SPRITE_PX / 2, SPRITE_PX / 2 + bobY, SPRITE_PX / 2 - 2)
        fg.fill({ color, alpha: 0.9 })
        fg.stroke({ color: 0xffffff, alpha: 0.5, width: 2 })
        const footOffset = f % 2 === 0 ? -2 : 2
        fg.circle(SPRITE_PX / 2 + footOffset, SPRITE_PX - 3, 3)
        fg.fill({ color: 0xffffff, alpha: 0.3 })
        frames.push(this.graphicsToTexture(fg, SPRITE_PX, SPRITE_PX))
      }
      this.cache.agentFrames.set(type, frames)
    }
  }

  // -- Buildings ------------------------------------------------------------

  private generateBuildingPlaceholders(): void {
    for (const [biome, color] of Object.entries(BIOME_COLORS)) {
      const variants: Texture[] = []
      const variantCount = 4
      for (let v = 0; v < variantCount; v++) {
        const g = new Graphics()
        const shade = this.shadeColor(color, (v - 1) * 15)
        g.rect(1, 4, TILE_PX - 2, TILE_PX - 5)
        g.fill({ color: shade, alpha: 0.8 })
        g.stroke({ color: 0xffffff, alpha: 0.3, width: 1 })
        g.rect(0, 0, TILE_PX, 6)
        g.fill({ color: this.shadeColor(shade, -20), alpha: 0.9 })
        const windowCount = v + 1
        const windowW = 4
        const spacing = (TILE_PX - 2) / (windowCount + 1)
        for (let w = 0; w < Math.min(windowCount, 3); w++) {
          const wx = 1 + spacing * (w + 1) - windowW / 2
          g.rect(wx, 10, windowW, 4)
          g.fill({ color: 0xffd700, alpha: 0.6 })
        }
        g.rect(TILE_PX / 2 - 3, TILE_PX - 8, 6, 8)
        g.fill({ color: this.shadeColor(shade, -30), alpha: 0.9 })
        variants.push(this.graphicsToTexture(g, TILE_PX, TILE_PX))
      }
      this.cache.buildings.set(biome, variants)
    }
  }

  // -- Tile States ----------------------------------------------------------

  private generateTilePlaceholders(): void {
    for (const [state, color] of Object.entries(TILE_STATE_COLORS)) {
      const g = new Graphics()
      g.rect(1, 1, TILE_PX - 2, TILE_PX - 2)
      g.fill({ color, alpha: 0.8 })
      g.stroke({ color: 0x000000, alpha: 0.3, width: 1 })

      if (state === 'scaffolding') {
        for (let i = 0; i < TILE_PX; i += 8) {
          g.moveTo(i, 1).lineTo(i, TILE_PX - 1)
          g.stroke({ color: 0x777777, alpha: 0.3, width: 1 })
        }
      } else if (state === 'complete') {
        g.moveTo(8, 16).lineTo(14, 22).lineTo(24, 10)
        g.stroke({ color: 0xffffff, alpha: 0.4, width: 2 })
      } else if (state === 'ruins') {
        g.moveTo(5, 5).lineTo(15, 18).lineTo(10, 28)
        g.stroke({ color: 0x333333, alpha: 0.4, width: 1 })
      }

      this.cache.tiles.set(state, this.graphicsToTexture(g, TILE_PX, TILE_PX))
    }
  }

  // -- Tools ----------------------------------------------------------------

  private generateToolPlaceholders(): void {
    for (const [toolId, color] of Object.entries(TOOL_COLORS)) {
      const g = new Graphics()
      g.circle(TOOL_PX / 2, TOOL_PX / 2, TOOL_PX / 2 - 1)
      g.fill({ color, alpha: 0.8 })
      g.stroke({ color: 0xffffff, alpha: 0.4, width: 1 })
      this.cache.tools.set(toolId, this.graphicsToTexture(g, TOOL_PX, TOOL_PX))
    }
  }

  // -- Monsters -------------------------------------------------------------

  private generateMonsterPlaceholders(): void {
    for (const [type, color] of Object.entries(MONSTER_COLORS)) {
      const size = MONSTER_SIZES[type] ?? 16

      const g = new Graphics()
      if (type === 'slime') {
        g.ellipse(size / 2, size / 2 + 2, size / 2 - 1, size / 3)
        g.fill({ color, alpha: 0.8 })
        g.circle(size / 3, size / 2, 2).fill({ color: 0xffffff })
        g.circle(size * 2 / 3, size / 2, 2).fill({ color: 0xffffff })
        g.circle(size / 3, size / 2, 1).fill({ color: 0x000000 })
        g.circle(size * 2 / 3, size / 2, 1).fill({ color: 0x000000 })
      } else if (type === 'skeleton') {
        g.circle(size / 2, 6, 5).fill({ color })
        g.rect(size / 2 - 3, 11, 6, 10).fill({ color, alpha: 0.8 })
        g.circle(size / 2 - 2, 5, 1).fill({ color: 0xe74c3c })
        g.circle(size / 2 + 2, 5, 1).fill({ color: 0xe74c3c })
      } else if (type === 'golem') {
        g.roundRect(2, 4, size - 4, size - 6, 4)
        g.fill({ color, alpha: 0.9 })
        g.stroke({ color: 0x000000, alpha: 0.3, width: 2 })
        g.circle(size / 3, size / 3, 3).fill({ color: 0xff6600 })
        g.circle(size * 2 / 3, size / 3, 3).fill({ color: 0xff6600 })
      } else if (type === 'dragon') {
        g.moveTo(size / 2, 2)
        g.lineTo(size - 2, size / 2)
        g.lineTo(size * 3 / 4, size - 2)
        g.lineTo(size / 4, size - 2)
        g.lineTo(2, size / 2)
        g.closePath()
        g.fill({ color, alpha: 0.9 })
        g.moveTo(2, size / 3).lineTo(-4, 0).lineTo(size / 4, size / 3)
        g.fill({ color, alpha: 0.5 })
        g.moveTo(size - 2, size / 3).lineTo(size + 4, 0).lineTo(size * 3 / 4, size / 3)
        g.fill({ color, alpha: 0.5 })
        g.circle(size / 3, size / 3, 2).fill({ color: 0xffd700 })
        g.circle(size * 2 / 3, size / 3, 2).fill({ color: 0xffd700 })
      }

      this.cache.monsters.set(type, this.graphicsToTexture(g, size, size))

      // Animation frames (2 frames — slight wobble)
      const frames: Texture[] = []
      for (let f = 0; f < 2; f++) {
        const fg = new Graphics()
        const scaleX = f === 0 ? 1 : 0.95
        const scaleY = f === 0 ? 1 : 1.05
        if (type === 'slime') {
          fg.ellipse(size / 2, size / 2 + 2, (size / 2 - 1) * scaleX, (size / 3) * scaleY)
          fg.fill({ color, alpha: 0.8 })
          fg.circle(size / 3, size / 2, 2).fill({ color: 0xffffff })
          fg.circle(size * 2 / 3, size / 2, 2).fill({ color: 0xffffff })
        } else {
          fg.circle(size / 2, size / 2 + (f * 2 - 1), size / 2 - 2)
          fg.fill({ color, alpha: 0.8 })
        }
        frames.push(this.graphicsToTexture(fg, size, size))
      }
      this.cache.monsterFrames.set(type, frames)
    }
  }

  // -- Biome Ground Tiles ---------------------------------------------------

  private generateBiomeTilePlaceholders(): void {
    for (const [biome, tileTypes] of Object.entries(BIOME_GROUND_TYPES)) {
      const biomeColor = BIOME_COLORS[biome] ?? 0x333333
      const tileMap = new Map<string, Texture>()

      for (let i = 0; i < tileTypes.length; i++) {
        const tileType = tileTypes[i]!
        const g = new Graphics()
        const shade = this.shadeColor(biomeColor, (i - 1) * 20)

        g.rect(0, 0, TILE_PX, TILE_PX)
        g.fill({ color: shade, alpha: 0.5 })

        if (tileType.includes('road') || tileType.includes('path')) {
          for (let y = 8; y < TILE_PX; y += 8) {
            g.moveTo(0, y).lineTo(TILE_PX, y)
            g.stroke({ color: shade, alpha: 0.35, width: 1 })
          }
        } else if (tileType.includes('water') || tileType.includes('dock')) {
          for (let y = 6; y < TILE_PX; y += 10) {
            g.moveTo(0, y)
            for (let x = 0; x <= TILE_PX; x += 4) {
              g.lineTo(x, y + Math.sin(x / 4) * 2)
            }
            g.stroke({ color: 0x3498db, alpha: 0.35, width: 1 })
          }
        } else if (tileType.includes('grass') || tileType.includes('garden') || tileType.includes('hedge')) {
          for (let dx = 4; dx < TILE_PX; dx += 8) {
            for (let dy = 4; dy < TILE_PX; dy += 8) {
              g.circle(dx + Math.random() * 2, dy + Math.random() * 2, 1)
              g.fill({ color: 0x27ae60, alpha: 0.35 })
            }
          }
        }

        tileMap.set(tileType, this.graphicsToTexture(g, TILE_PX, TILE_PX))
      }

      this.cache.biomeTiles.set(biome, tileMap)
    }
  }

  // -- Status Dots ----------------------------------------------------------

  private generateStatusDots(): void {
    if (!this.renderer) return
    for (const [status, color] of Object.entries(STATUS_COLORS)) {
      const g = new Graphics()
      g.circle(4, 4, 4)
      g.fill({ color })
      this.cache.statusDots.set(status, this.graphicsToTexture(g, 8, 8))
    }
  }

  // -- Work Item Icons (placeholder) ----------------------------------------

  private generateWorkItemIconPlaceholders(): void {
    const icons: Record<string, { color: number }> = {
      queued: { color: 0xf39c12 },
      active: { color: 0x3498db },
      blocked: { color: 0xe74c3c },
      done: { color: 0x27ae60 },
    }

    for (const [status, { color }] of Object.entries(icons)) {
      if (this.cache.workItemIcons.has(status)) continue
      const g = new Graphics()
      const s = 12
      g.moveTo(s, 0)
      g.lineTo(s * 2, s)
      g.lineTo(s, s * 2)
      g.lineTo(0, s)
      g.closePath()
      g.fill({ color, alpha: 0.7 })
      g.stroke({ color: 0xffffff, alpha: 0.5, width: 1 })
      this.cache.workItemIcons.set(status, this.graphicsToTexture(g, s * 2, s * 2))
    }
  }

  // -- Particles (placeholder) ----------------------------------------------

  private generateParticlePlaceholders(): void {
    if (this.cache.particles.has('circle')) return // already loaded real ones

    const gCircle = new Graphics()
    gCircle.circle(4, 4, 4)
    gCircle.fill({ color: 0xffffff, alpha: 0.8 })
    this.cache.particles.set('circle', this.graphicsToTexture(gCircle, 8, 8))

    const gSpark = new Graphics()
    gSpark.star(6, 6, 4, 6, 2)
    gSpark.fill({ color: 0xffd700, alpha: 0.9 })
    this.cache.particles.set('spark', this.graphicsToTexture(gSpark, 12, 12))

    const gSmoke = new Graphics()
    gSmoke.circle(8, 8, 8)
    gSmoke.fill({ color: 0x888888, alpha: 0.4 })
    this.cache.particles.set('smoke', this.graphicsToTexture(gSmoke, 16, 16))

    const gTrail = new Graphics()
    gTrail.ellipse(4, 2, 4, 2)
    gTrail.fill({ color: 0xffffff, alpha: 0.5 })
    this.cache.particles.set('trail', this.graphicsToTexture(gTrail, 8, 4))
  }

  // =========================================================================
  // Texture Getters
  // =========================================================================

  /** Get agent texture. Pass frame index for walk animation (0-3). */
  getAgentTexture(agentType: string, frame?: number): Texture {
    if (frame !== undefined) {
      const frames = this.cache.agentFrames.get(agentType)
      if (frames && frames[frame % frames.length]) {
        return frames[frame % frames.length]!
      }
    }
    return this.cache.agents.get(agentType) ?? Texture.WHITE
  }

  /** Get building texture for a biome + variant index. */
  getBuildingTexture(biome: string, variant = 0): Texture {
    const variants = this.cache.buildings.get(biome)
    if (variants && variants.length > 0) {
      return variants[variant % variants.length]!
    }
    return Texture.WHITE
  }

  /** Get tile-state texture (scaffolding, building, complete, ruins). */
  getTileTexture(state: string): Texture {
    return this.cache.tiles.get(state) ?? Texture.WHITE
  }

  /** Get tool icon texture by tool ID (e.g., 'tool_code_edit'). */
  getToolTexture(toolKey: string): Texture {
    return this.cache.tools.get(toolKey) ?? Texture.WHITE
  }

  /** Get the tool display label (short text — no emojis). */
  getToolSymbol(toolKey: string): string {
    return TOOL_SYMBOLS[toolKey] ?? 'Tool'
  }

  /** Get tool color. */
  getToolColor(toolKey: string): number {
    return TOOL_COLORS[toolKey] ?? 0xffffff
  }

  /** Get monster texture. Pass frame for animation (0-1). */
  getMonsterTexture(monsterType: string, frame?: number): Texture {
    if (frame !== undefined) {
      const frames = this.cache.monsterFrames.get(monsterType)
      if (frames && frames[frame % frames.length]) {
        return frames[frame % frames.length]!
      }
    }
    return this.cache.monsters.get(monsterType) ?? Texture.WHITE
  }

  /** Get monster size in pixels. */
  getMonsterSize(monsterType: string): number {
    return MONSTER_SIZES[monsterType] ?? 16
  }

  /** Get particle texture by name. */
  getParticleTexture(name: string): Texture {
    return this.cache.particles.get(name) ?? Texture.WHITE
  }

  /** Get biome-specific ground tile texture. */
  getBiomeTileTexture(biome: string, tileType: string): Texture {
    const biomeMap = this.cache.biomeTiles.get(biome)
    if (biomeMap) {
      return biomeMap.get(tileType) ?? Texture.WHITE
    }
    return Texture.WHITE
  }

  /** Get a list of ground tile types for a biome. */
  getBiomeTileTypes(biome: string): string[] {
    return BIOME_GROUND_TYPES[biome] ?? []
  }

  /** Get status dot texture. */
  getStatusDotTexture(status: string): Texture {
    return this.cache.statusDots.get(status) ?? Texture.WHITE
  }

  /** Get work item icon texture by status. */
  getWorkItemIconTexture(status: string): Texture {
    return this.cache.workItemIcons.get(status) ?? Texture.WHITE
  }

  /** Get a road/path tile texture by key (e.g., 'path_1', 'cobble_2'). */
  getRoadTileTexture(key: string): Texture {
    return this.cache.roadTiles.get(key) ?? Texture.WHITE
  }

  /**
   * Get any tile texture by its region key (e.g., 'castle_tl', 'fence_h').
   * Lazily crops from the sprite sheet on first access, then caches.
   */
  getAnyTileTexture(key: string): Texture {
    // Check road cache first (already loaded)
    const cached = this.cache.roadTiles.get(key)
    if (cached) return cached

    // Lazily crop from sheet
    const region = this.getRegion(key)
    if (region) {
      const tex = this.cropRegion(region)
      this.cache.roadTiles.set(key, tex) // reuse roadTiles cache for all lazily-loaded tiles
      return tex
    }
    return Texture.WHITE
  }

  /** Whether real sprite sheets (Kenney assets) are loaded vs placeholders. */
  get usingRealAssets(): boolean {
    return this._realAssetsAvailable
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Convert a Graphics object to a Texture using the renderer. */
  private graphicsToTexture(g: Graphics, width: number, height: number): Texture {
    if (!this.renderer) {
      return Texture.WHITE
    }
    const rt = RenderTexture.create({
      width,
      height,
      resolution: 2,                 // Retina-quality
      antialias: false,
    })
    // Set pixel-art scale mode
    rt.source.scaleMode = 'nearest'
    this.renderer.render({ container: g, target: rt })
    return rt
  }

  /** Lighten or darken a color by a percentage (-100 to +100). */
  private shadeColor(color: number, percent: number): number {
    const r = Math.min(255, Math.max(0, ((color >> 16) & 0xff) + Math.round(2.55 * percent)))
    const g = Math.min(255, Math.max(0, ((color >> 8) & 0xff) + Math.round(2.55 * percent)))
    const b = Math.min(255, Math.max(0, (color & 0xff) + Math.round(2.55 * percent)))
    return (r << 16) | (g << 8) | b
  }
}
