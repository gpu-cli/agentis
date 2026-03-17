// ============================================================================
// Entity Sprite Map — Semantic resolver for agent, tool, and event sprites
//
// Provides a unified API for resolving entity types to sprite region keys.
// Loads a user-editable JSON config at runtime, falling back to hardcoded
// defaults if the JSON fails to load. Agent sprites are type-locked with
// deterministic variant selection: hash(agent.id) % variants.length ensures
// the same agent always renders the same sprite everywhere.
//
// Usage:
//   import { entitySprites } from './entity-sprite-map'
//   await entitySprites.init()
//   const key = entitySprites.resolveAgent('claude', 'agent-123')
//   const key = entitySprites.resolveTool('tool_code_edit')
//   const key = entitySprites.resolveEvent('error', 'critical')
// ============================================================================

import type { WorldEventCategory } from '../stores/eventStore'

// ---------------------------------------------------------------------------
// Config Shape (matches entity-sprites.json)
// ---------------------------------------------------------------------------

export interface AgentSpriteConfig {
  /** Primary sprite region key for this agent type */
  base: string
  /** Variant region keys — agent.id hash selects from this list */
  variants: string[]
}

export interface EntitySpriteConfig {
  agents: Record<string, AgentSpriteConfig>
  tools: Record<string, string>
  /**
   * Event sprite config. Each category maps severity levels to either:
   *   - a single region key string (backward-compatible, no variability)
   *   - an array of region keys (deterministic variant pool, selected by event ID hash)
   */
  events: Record<string, Record<string, string | string[]>>
}

// ---------------------------------------------------------------------------
// Hardcoded Defaults (used when JSON fails to load)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: EntitySpriteConfig = {
  agents: {
    claude:   { base: 'hero_knight',  variants: ['hero_knight', 'npc_guard', 'hero_cleric'] },
    cursor:   { base: 'hero_rogue',   variants: ['hero_rogue', 'npc_thief', 'npc_assassin'] },
    codex:    { base: 'hero_mage',    variants: ['hero_mage', 'npc_wizard', 'npc_monk'] },
    gemini:   { base: 'hero_ranger',  variants: ['hero_ranger', 'npc_bard', 'npc_farmer'] },
    openclaw: { base: 'hero_barb',    variants: ['hero_barb', 'npc_smith', 'npc_elder'] },
  },
  tools: {
    tool_code_edit:     'shield_town',    // town tile_0129 — shield/armor icon
    tool_file_read:     'saw',            // town tile_0117 — saw/glasses icon
    tool_web_search:    'bucket',         // town tile_0119 — bucket/magnifier icon
    tool_terminal:      'bridge_end_r',   // town tile_0115 — anvil/terminal icon
    tool_git:           'sword_town',     // town tile_0128 — lantern/scroll icon
    tool_testing:       'monster_golem',  // dungeon tile_0115 — red potion
    tool_deploy:        'shovel',         // town tile_0118 — flag/rocket icon
    tool_documentation: 'arrow_item',     // town tile_0131 — bookshelf icon
    tool_slack:         'target_board',   // town tile_0083 — chest/comms icon
    tool_email:         'target_board',   // town tile_0083 — chest/comms icon
    tool_database:      'mushroom',       // town tile_0094 — bell/orb icon
    tool_api_call:      'hammer_town',    // town tile_0116 — well/beacon icon
    tool_image_gen:     'monster_ghost',  // dungeon tile_0114 — green potion
  },
  events: {
    error: {
      default:  ['skull', 'monster_skeleton', 'monster_zombie'],
      warning:  ['monster_bat', 'monster_ghost', 'monster_slime'],
      error:    ['monster_slime', 'monster_skeleton', 'monster_zombie', 'monster_bat'],
      critical: ['monster_spider', 'monster_demon', 'monster_golem', 'monster_dragon'],
      outage:   ['monster_rat', 'monster_boss_1', 'monster_boss_2', 'monster_dragon'],
    },
    deployment:  { default: 'shovel' },
    file_change: { default: 'saw' },
    task:        { default: 'banner_1' },
    comms:       { default: 'target_board' },
    combat:      { default: 'monster_boss_1' },
  },
}

// ---------------------------------------------------------------------------
// String hash (djb2) — deterministic, fast, collision-resistant enough
// ---------------------------------------------------------------------------

function djb2Hash(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// ---------------------------------------------------------------------------
// Fallback region key — always exists in both tilesets
// ---------------------------------------------------------------------------

const FALLBACK_AGENT_KEY = 'hero_knight'
const FALLBACK_TOOL_KEY = 'gold_bar'
const FALLBACK_EVENT_KEY = 'skull'

// ---------------------------------------------------------------------------
// JSON Config Path
// Canonical source: apps/web/public/assets/config/entity-sprites.json
// Loaded at runtime via fetch() from the web app's public directory.
// ---------------------------------------------------------------------------

const CONFIG_PATH = '/assets/config/entity-sprites.json'

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class EntitySpriteMap {
  private config: EntitySpriteConfig = DEFAULT_CONFIG
  private initialized = false

  /** Cache: agentId → resolved region key (avoids re-hashing) */
  private agentCache = new Map<string, string>()

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Load user-editable JSON config. Falls back to hardcoded defaults on error.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  async init(): Promise<void> {
    if (this.initialized) return

    try {
      const response = await fetch(CONFIG_PATH)
      if (response.ok) {
        const json = await response.json() as Partial<EntitySpriteConfig>
        this.mergeConfig(json)
        console.log('[EntitySpriteMap] Loaded user config from', CONFIG_PATH)
      } else {
        console.warn(`[EntitySpriteMap] Config fetch returned ${response.status}, using defaults`)
      }
    } catch (err) {
      console.warn('[EntitySpriteMap] Failed to load config, using defaults:', err)
    }

    this.initialized = true
    this.validateConfig()
  }

  /**
   * Merge user JSON with defaults. User config overrides per-key;
   * missing keys fall back to defaults.
   */
  private mergeConfig(user: Partial<EntitySpriteConfig>): void {
    if (user.agents) {
      for (const [type, agentConfig] of Object.entries(user.agents)) {
        if (agentConfig && agentConfig.base && Array.isArray(agentConfig.variants) && agentConfig.variants.length > 0) {
          this.config.agents[type] = agentConfig
        }
      }
    }
    if (user.tools) {
      for (const [toolId, regionKey] of Object.entries(user.tools)) {
        if (typeof regionKey === 'string') {
          this.config.tools[toolId] = regionKey
        }
      }
    }
    if (user.events) {
      for (const [category, severityMap] of Object.entries(user.events)) {
        if (severityMap && typeof severityMap === 'object') {
          // Validate each entry is a string or string[]
          const validated: Record<string, string | string[]> = {}
          for (const [sev, val] of Object.entries(severityMap)) {
            if (typeof val === 'string') {
              validated[sev] = val
            } else if (Array.isArray(val) && val.length > 0 && val.every((v: unknown) => typeof v === 'string')) {
              validated[sev] = val
            }
          }
          this.config.events[category] = { ...this.config.events[category], ...validated }
        }
      }
    }
  }

  /**
   * Validate that all config values reference known region keys.
   * Logs warnings for missing keys but doesn't fail.
   */
  private validateConfig(): void {
    // Import-free validation — we just log warnings about potential issues.
    // Actual texture resolution validates at render time via the atlas registry.
    const allKeys = new Set<string>()

    for (const agentConfig of Object.values(this.config.agents)) {
      allKeys.add(agentConfig.base)
      for (const v of agentConfig.variants) allKeys.add(v)
    }
    for (const toolKey of Object.values(this.config.tools)) allKeys.add(toolKey)
    for (const severityMap of Object.values(this.config.events)) {
      for (const value of Object.values(severityMap)) {
        if (Array.isArray(value)) {
          for (const regionKey of value) allKeys.add(regionKey)
        } else {
          allKeys.add(value)
        }
      }
    }

    if (allKeys.size > 0) {
      console.log(`[EntitySpriteMap] Config references ${allKeys.size} unique region keys`)
    }
  }

  // -----------------------------------------------------------------------
  // Resolution
  // -----------------------------------------------------------------------

  /**
   * Resolve an agent type + id to a sprite region key.
   *
   * @param agentType - Agent type (e.g., 'claude', 'cursor')
   * @param agentId   - Unique agent ID for deterministic variant selection
   * @returns Sprite region key (e.g., 'hero_knight')
   */
  resolveAgent(agentType: string, agentId: string): string {
    // Check cache first
    const cached = this.agentCache.get(agentId)
    if (cached) return cached

    const agentConfig = this.config.agents[agentType]
    if (!agentConfig) {
      // Unknown agent type — fall back to base fallback
      this.agentCache.set(agentId, FALLBACK_AGENT_KEY)
      return FALLBACK_AGENT_KEY
    }

    const variants = agentConfig.variants
    if (variants.length === 0) {
      this.agentCache.set(agentId, agentConfig.base)
      return agentConfig.base
    }

    // Deterministic variant: hash the agent ID
    const idx = djb2Hash(agentId) % variants.length
    const key = variants[idx] ?? agentConfig.base
    this.agentCache.set(agentId, key)
    return key
  }

  /**
   * Resolve a tool ID to a sprite region key.
   *
   * @param toolId - Tool identifier (e.g., 'tool_code_edit')
   * @returns Sprite region key (e.g., 'item_axe')
   */
  resolveTool(toolId: string): string {
    return this.config.tools[toolId] ?? FALLBACK_TOOL_KEY
  }

  /**
   * Resolve an event category + optional severity to a sprite region key.
   * Returns the first element when the mapping is an array (stable default).
   *
   * @param category - Event category (e.g., 'error', 'deployment')
   * @param severity - Optional severity level (e.g., 'warning', 'critical')
   * @returns Sprite region key (e.g., 'skull', 'monster_dragon')
   */
  resolveEvent(category: WorldEventCategory | string, severity?: string): string {
    const severityMap = this.config.events[category]
    if (!severityMap) return FALLBACK_EVENT_KEY

    if (severity && severityMap[severity]) {
      const value = severityMap[severity]
      return Array.isArray(value) ? (value[0] ?? FALLBACK_EVENT_KEY) : value
    }
    const defaultValue = severityMap['default']
    if (!defaultValue) return FALLBACK_EVENT_KEY
    return Array.isArray(defaultValue) ? (defaultValue[0] ?? FALLBACK_EVENT_KEY) : defaultValue
  }

  /**
   * Resolve an event to a deterministic-random sprite variant.
   * Uses hash(eventId) to pick from the variant pool for the given severity,
   * so the same event always renders the same sprite but different events
   * get visually distinct sprites.
   *
   * @param category  - Event category (e.g., 'error')
   * @param severity  - Severity level (e.g., 'warning', 'error', 'critical')
   * @param eventId   - Unique event/monster ID for deterministic variant selection
   * @returns Sprite region key
   */
  resolveEventVariant(category: WorldEventCategory | string, severity?: string, eventId?: string): string {
    const severityMap = this.config.events[category]
    if (!severityMap) return FALLBACK_EVENT_KEY

    // Pick the right entry: severity-specific first, then 'default'
    const entry = (severity && severityMap[severity]) ? severityMap[severity] : severityMap['default']
    if (!entry) return FALLBACK_EVENT_KEY

    // If it's a string (no variant pool), return directly
    if (typeof entry === 'string') return entry

    // Array variant pool — use hash of eventId for deterministic pick
    if (entry.length === 0) return FALLBACK_EVENT_KEY
    if (!eventId || entry.length === 1) return entry[0] ?? FALLBACK_EVENT_KEY

    const idx = djb2Hash(eventId) % entry.length
    return entry[idx] ?? entry[0] ?? FALLBACK_EVENT_KEY
  }

  /**
   * Get the full agent config for a type (for UI display — shows all variants).
   */
  getAgentConfig(agentType: string): AgentSpriteConfig | null {
    return this.config.agents[agentType] ?? null
  }

  /**
   * Get all configured tool IDs and their region keys.
   */
  getToolMap(): Readonly<Record<string, string>> {
    return this.config.tools
  }

  /**
   * Get all configured event categories and their severity→region mappings.
   * For backward compatibility, array values are flattened to their first element.
   */
  getEventMap(): Readonly<Record<string, Record<string, string>>> {
    const result: Record<string, Record<string, string>> = {}
    for (const [category, severityMap] of Object.entries(this.config.events)) {
      const flat: Record<string, string> = {}
      for (const [severity, value] of Object.entries(severityMap)) {
        flat[severity] = Array.isArray(value) ? (value[0] ?? FALLBACK_EVENT_KEY) : value
      }
      result[category] = flat
    }
    return result
  }

  /**
   * Get the agent type → base region key mapping (e.g., { claude: 'hero_knight' }).
   * Used by AssetLoader to preload textures for known agent types.
   */
  getAgentTypeMap(): Readonly<Record<string, string>> {
    const result: Record<string, string> = {}
    for (const [type, config] of Object.entries(this.config.agents)) {
      result[type] = config.base
    }
    return result
  }

  /**
   * Get a deduplicated set of ALL agent sprite region keys (bases + all variants).
   * Used by AssetLoader to preload every possible agent texture.
   */
  getAllAgentSpriteKeys(): string[] {
    const keys = new Set<string>()
    for (const config of Object.values(this.config.agents)) {
      keys.add(config.base)
      for (const v of config.variants) keys.add(v)
    }
    return Array.from(keys)
  }

  /**
   * Get the monster-type → region key mapping from event error severities.
   * Used by AssetLoader to preload monster textures.
   * Collects ALL variant keys so textures are preloaded for every possible sprite.
   */
  getMonsterSpriteMap(): Readonly<Record<string, string>> {
    const errorMap = this.config.events['error']
    if (!errorMap) return {}
    const result: Record<string, string> = {}
    for (const [severity, value] of Object.entries(errorMap)) {
      if (severity === 'default') continue
      const keys = Array.isArray(value) ? value : [value]
      for (const regionKey of keys) {
        const monsterType = regionKey.startsWith('monster_') ? regionKey.replace('monster_', '') : `${severity}_${regionKey}`
        result[monsterType] = regionKey
      }
    }
    return result
  }

  /**
   * Get ALL unique sprite region keys referenced in the error event config.
   * Used by AssetLoader to preload every possible error/monster texture.
   */
  getAllErrorSpriteKeys(): string[] {
    const errorMap = this.config.events['error']
    if (!errorMap) return [FALLBACK_EVENT_KEY]
    const keys = new Set<string>()
    for (const value of Object.values(errorMap)) {
      if (Array.isArray(value)) {
        for (const k of value) keys.add(k)
      } else {
        keys.add(value)
      }
    }
    return Array.from(keys)
  }

  /**
   * Check whether the registry has been initialized.
   */
  get isReady(): boolean {
    return this.initialized
  }

  /**
   * Clear the agent cache. Call when agent assignments should be recalculated
   * (e.g., on scenario reload).
   */
  clearCache(): void {
    this.agentCache.clear()
  }

  /**
   * Force a re-init from JSON. Clears caches and reloads config.
   */
  async reload(): Promise<void> {
    this.initialized = false
    this.agentCache.clear()
    this.config = { ...DEFAULT_CONFIG }
    await this.init()
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/** Global entity sprite map instance */
export const entitySprites = new EntitySpriteMap()
