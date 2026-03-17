// ============================================================================
// Entity Sprite Map — Unit Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { EntitySpriteMap, ALLOWED_AGENT_SPRITES, ALLOWED_ERROR_SPRITES } from '../engine/entity-sprite-map'

describe('EntitySpriteMap', () => {
  let map: EntitySpriteMap

  beforeEach(() => {
    // Create a fresh instance for each test (don't use the singleton)
    map = new EntitySpriteMap()
  })

  // -----------------------------------------------------------------------
  // Agent Resolution
  // -----------------------------------------------------------------------

  describe('resolveAgent', () => {
    it('resolves known agent types to a variant from their config', () => {
      const key = map.resolveAgent('claude', 'agent-1')
      expect(['hero_knight', 'npc_guard', 'hero_cleric']).toContain(key)
    })

    it('returns deterministic sprite for the same agent ID', () => {
      const key1 = map.resolveAgent('claude', 'agent-abc')
      const key2 = map.resolveAgent('claude', 'agent-abc')
      expect(key1).toBe(key2)
    })

    it('different agent IDs may get different variants', () => {
      // With 3 variants, testing enough IDs should produce at least 2 distinct keys
      const keys = new Set<string>()
      for (let i = 0; i < 50; i++) {
        keys.add(map.resolveAgent('claude', `agent-${i}`))
      }
      expect(keys.size).toBeGreaterThanOrEqual(2)
    })

    it('resolves all known agent types', () => {
      const types = ['claude', 'cursor', 'codex', 'gemini', 'openclaw']
      for (const type of types) {
        const key = map.resolveAgent(type, `${type}-1`)
        expect(key).toBeTruthy()
        expect(typeof key).toBe('string')
      }
    })

    it('falls back to hero_knight for unknown agent types', () => {
      const key = map.resolveAgent('unknown_agent', 'id-1')
      expect(key).toBe('hero_knight')
    })

    it('caches resolved keys', () => {
      const key1 = map.resolveAgent('claude', 'cached-agent')
      map.clearCache()
      const key2 = map.resolveAgent('claude', 'cached-agent')
      // Same hash = same result even after cache clear
      expect(key1).toBe(key2)
    })
  })

  // -----------------------------------------------------------------------
  // Tool Resolution
  // -----------------------------------------------------------------------

  describe('resolveTool', () => {
    it('resolves known tool IDs', () => {
      expect(map.resolveTool('tool_code_edit')).toBe('shield_town')
      expect(map.resolveTool('tool_testing')).toBe('mushroom')
      expect(map.resolveTool('tool_deploy')).toBe('shovel')
      expect(map.resolveTool('tool_terminal')).toBe('bridge_end_r')
    })

    it('falls back to gold_bar for unknown tools', () => {
      expect(map.resolveTool('tool_unknown')).toBe('gold_bar')
    })

    it('resolves all default tools', () => {
      const tools = [
        'tool_email', 'tool_code_edit', 'tool_web_search', 'tool_slack',
        'tool_file_read', 'tool_git', 'tool_deploy', 'tool_database',
        'tool_api_call', 'tool_testing', 'tool_documentation', 'tool_image_gen',
        'tool_terminal',
      ]
      for (const toolId of tools) {
        const key = map.resolveTool(toolId)
        expect(key).toBeTruthy()
        expect(typeof key).toBe('string')
      }
    })
  })

  // -----------------------------------------------------------------------
  // Event Resolution
  // -----------------------------------------------------------------------

  describe('resolveEvent', () => {
    it('resolves event categories to default sprite (first from array)', () => {
      expect(map.resolveEvent('error')).toBe('monster_slime')
      expect(map.resolveEvent('deployment')).toBe('shovel')
      expect(map.resolveEvent('file_change')).toBe('saw')
      expect(map.resolveEvent('task')).toBe('banner_1')
      expect(map.resolveEvent('comms')).toBe('target_board')
      expect(map.resolveEvent('combat')).toBe('item_sword')
    })

    it('resolves error severity levels to first variant', () => {
      expect(map.resolveEvent('error', 'warning')).toBe('monster_slime')
      expect(map.resolveEvent('error', 'error')).toBe('monster_spider')
      expect(map.resolveEvent('error', 'critical')).toBe('hero_ranger')
      expect(map.resolveEvent('error', 'outage')).toBe('item_sword')
    })

    it('falls back to default when severity not found', () => {
      expect(map.resolveEvent('error', 'unknown_severity')).toBe('monster_slime')
    })

    it('falls back to monster_slime for unknown categories', () => {
      expect(map.resolveEvent('unknown_category')).toBe('monster_slime')
    })
  })

  // -----------------------------------------------------------------------
  // Event Variant Resolution (deterministic-random)
  // -----------------------------------------------------------------------

  describe('resolveEventVariant', () => {
    it('returns deterministic sprite for the same event ID', () => {
      const key1 = map.resolveEventVariant('error', 'error', 'evt-001')
      const key2 = map.resolveEventVariant('error', 'error', 'evt-001')
      expect(key1).toBe(key2)
    })

    it('different event IDs distribute across variant pool', () => {
      const keys = new Set<string>()
      for (let i = 0; i < 100; i++) {
        keys.add(map.resolveEventVariant('error', 'error', `evt-${i}`))
      }
      // error severity has 4 variants — should use at least 2
      expect(keys.size).toBeGreaterThanOrEqual(2)
    })

    it('uses all variants in the pool with enough IDs', () => {
      const distribution = new Map<string, number>()
      for (let i = 0; i < 500; i++) {
        const key = map.resolveEventVariant('error', 'error', `monster-${i}`)
        distribution.set(key, (distribution.get(key) ?? 0) + 1)
      }
      // error severity pool: ['monster_spider', 'monster_rat', 'npc_smith', 'hero_rogue']
      expect(distribution.size).toBe(4)
    })

    it('critical severity uses its own variant pool', () => {
      const keys = new Set<string>()
      for (let i = 0; i < 200; i++) {
        keys.add(map.resolveEventVariant('error', 'critical', `crit-${i}`))
      }
      // critical pool: ['hero_ranger', 'item_sword', 'item_axe', 'item_dagger']
      expect(keys.size).toBe(4)
      expect(keys).toContain('hero_ranger')
      expect(keys).toContain('item_sword')
    })

    it('falls back to default pool when severity not found', () => {
      const key = map.resolveEventVariant('error', 'unknown_sev', 'evt-x')
      // default pool: ['monster_slime', 'monster_bat', 'monster_spider']
      expect(['monster_slime', 'monster_bat', 'monster_spider']).toContain(key)
    })

    it('works with non-array event configs (string passthrough)', () => {
      const key = map.resolveEventVariant('deployment', undefined, 'deploy-1')
      expect(key).toBe('shovel')
    })

    it('falls back gracefully without eventId', () => {
      const key = map.resolveEventVariant('error', 'error')
      expect(key).toBe('monster_spider') // first element of error pool
    })

    it('falls back to monster_slime for unknown categories', () => {
      const key = map.resolveEventVariant('unknown', undefined, 'evt-1')
      expect(key).toBe('monster_slime')
    })

    it('same event ID always produces same sprite across fresh instances', () => {
      const results = new Set<string>()
      for (let i = 0; i < 50; i++) {
        const freshMap = new EntitySpriteMap()
        results.add(freshMap.resolveEventVariant('error', 'error', 'stable-event-id'))
      }
      expect(results.size).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // Config Accessors
  // -----------------------------------------------------------------------

  describe('config accessors', () => {
    it('getAgentConfig returns config for known types', () => {
      const config = map.getAgentConfig('claude')
      expect(config).not.toBeNull()
      expect(config!.base).toBe('hero_knight')
      expect(config!.variants).toContain('hero_knight')
    })

    it('getAgentConfig returns null for unknown types', () => {
      expect(map.getAgentConfig('unknown')).toBeNull()
    })

    it('getToolMap returns all configured tools', () => {
      const toolMap = map.getToolMap()
      expect(Object.keys(toolMap).length).toBeGreaterThanOrEqual(13)
      expect(toolMap['tool_code_edit']).toBe('shield_town')
    })

    it('getEventMap returns all configured events (flattened to first variant)', () => {
      const eventMap = map.getEventMap()
      expect(Object.keys(eventMap)).toContain('error')
      expect(Object.keys(eventMap)).toContain('deployment')
      // Array values are flattened to their first element
      expect(eventMap['error']!['critical']).toBe('hero_ranger')
      expect(eventMap['error']!['default']).toBe('monster_slime')
      // Non-array values stay as-is
      expect(eventMap['deployment']!['default']).toBe('shovel')
    })

    it('getAgentTypeMap returns base sprite for each agent type', () => {
      const typeMap = map.getAgentTypeMap()
      expect(typeMap['claude']).toBe('hero_knight')
      expect(typeMap['cursor']).toBe('hero_mage')
      expect(typeMap['codex']).toBe('npc_wizard')
      expect(typeMap['gemini']).toBe('npc_bard')
      expect(typeMap['openclaw']).toBe('npc_guard')
      expect(Object.keys(typeMap).length).toBe(5)
    })

    it('getAllAgentSpriteKeys returns deduplicated set of all variant keys', () => {
      const keys = map.getAllAgentSpriteKeys()
      // All keys should be from the approved agent allowlist
      for (const k of keys) {
        expect(ALLOWED_AGENT_SPRITES.has(k)).toBe(true)
      }
      expect(keys).toContain('hero_knight')
      expect(keys).toContain('npc_guard')
      expect(keys).toContain('hero_cleric')
    })

    it('getMonsterSpriteMap returns all error variant region keys', () => {
      const monsterMap = map.getMonsterSpriteMap()
      // Should contain the curated error sprites
      expect(monsterMap['slime']).toBe('monster_slime')
      expect(monsterMap['spider']).toBe('monster_spider')
      expect(monsterMap['bat']).toBe('monster_bat')
      expect(monsterMap['rat']).toBe('monster_rat')
      // All keys should be from allowed error sprites
      for (const key of Object.values(monsterMap)) {
        expect(ALLOWED_ERROR_SPRITES.has(key)).toBe(true)
      }
    })
  })

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('starts uninitialized', () => {
      expect(map.isReady).toBe(false)
    })

    it('works without init (uses defaults)', () => {
      // Should return valid keys even before init()
      expect(map.resolveAgent('claude', 'id-1')).toBeTruthy()
      expect(map.resolveTool('tool_code_edit')).toBe('shield_town')
      expect(map.resolveEvent('error')).toBe('monster_slime')
    })

    it('clearCache resets agent cache', () => {
      map.resolveAgent('claude', 'agent-x')
      map.clearCache()
      // Should still work after clearing
      const key = map.resolveAgent('claude', 'agent-x')
      expect(key).toBeTruthy()
    })
  })

  // -----------------------------------------------------------------------
  // Hash Determinism
  // -----------------------------------------------------------------------

  describe('hash determinism', () => {
    it('same agent type + id always produces same sprite', () => {
      const results = new Set<string>()
      for (let i = 0; i < 100; i++) {
        // Create fresh instance each time to prove it's not caching
        const freshMap = new EntitySpriteMap()
        results.add(freshMap.resolveAgent('claude', 'deterministic-agent'))
      }
      expect(results.size).toBe(1)
    })

    it('different agent IDs distribute across variants', () => {
      const distribution = new Map<string, number>()
      for (let i = 0; i < 300; i++) {
        const freshMap = new EntitySpriteMap()
        const key = freshMap.resolveAgent('claude', `agent-${i}`)
        distribution.set(key, (distribution.get(key) ?? 0) + 1)
      }
      // With 3 variants and 300 IDs, each should get roughly 100
      // We just check that all 3 variants are used
      expect(distribution.size).toBe(3)
    })
  })

  // -----------------------------------------------------------------------
  // Panel ↔ World Sprite Consistency
  // -----------------------------------------------------------------------

  describe('panel-world sprite consistency', () => {
    it('resolveEventVariant returns same key regardless of caller (panel vs world)', () => {
      // Simulate: MonsterManager calls resolveEventVariant('error', severity, id)
      // MonsterPanel must call the same thing to get the matching icon.
      // This test proves a single call path produces identical results.
      const severities = ['warning', 'error', 'critical', 'outage']
      for (const severity of severities) {
        for (let i = 0; i < 50; i++) {
          const monsterId = `monster_synth_${i}`
          const worldKey = map.resolveEventVariant('error', severity, monsterId)
          const panelKey = map.resolveEventVariant('error', severity, monsterId)
          expect(panelKey).toBe(worldKey)
        }
      }
    })

    it('resolveEventVariant differs from resolveEvent for varied IDs', () => {
      // resolveEvent always returns the first variant (no ID hashing)
      // resolveEventVariant with different IDs should produce variety
      const defaultKey = map.resolveEvent('error', 'error')
      const variantKeys = new Set<string>()
      for (let i = 0; i < 100; i++) {
        variantKeys.add(map.resolveEventVariant('error', 'error', `monster_${i}`))
      }
      // The variant set should contain more than just the default
      expect(variantKeys.size).toBeGreaterThan(1)
      // The default key should be one of the possible variants
      expect(variantKeys).toContain(defaultKey)
    })
  })

  // -----------------------------------------------------------------------
  // Sprite Allowlist Enforcement
  // -----------------------------------------------------------------------

  describe('sprite allowlists', () => {
    it('all default agent variants are in ALLOWED_AGENT_SPRITES', () => {
      const types = ['claude', 'cursor', 'codex', 'gemini', 'openclaw']
      for (const type of types) {
        const config = map.getAgentConfig(type)
        expect(config).not.toBeNull()
        expect(ALLOWED_AGENT_SPRITES.has(config!.base)).toBe(true)
        for (const v of config!.variants) {
          expect(ALLOWED_AGENT_SPRITES.has(v)).toBe(true)
        }
      }
    })

    it('all default error event sprites are in ALLOWED_ERROR_SPRITES', () => {
      const severities = ['default', 'warning', 'error', 'critical', 'outage']
      for (const severity of severities) {
        for (let i = 0; i < 50; i++) {
          const key = map.resolveEventVariant('error', severity, `test-${severity}-${i}`)
          expect(ALLOWED_ERROR_SPRITES.has(key)).toBe(true)
        }
      }
    })

    it('resolveAgent never returns a key outside the allowlist', () => {
      const types = ['claude', 'cursor', 'codex', 'gemini', 'openclaw']
      for (const type of types) {
        for (let i = 0; i < 50; i++) {
          const key = map.resolveAgent(type, `agent-${type}-${i}`)
          expect(ALLOWED_AGENT_SPRITES.has(key)).toBe(true)
        }
      }
    })

    it('no agent sprite key appears in error allowlist (disjoint pools)', () => {
      // Verify the pools are completely disjoint
      let overlap = 0
      for (const key of ALLOWED_AGENT_SPRITES) {
        if (ALLOWED_ERROR_SPRITES.has(key)) overlap++
      }
      expect(overlap).toBe(0)
    })
  })
})
