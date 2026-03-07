// ============================================================================
// Entity Sprite Map — Unit Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { EntitySpriteMap } from '../engine/entity-sprite-map'

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
      expect(map.resolveTool('tool_testing')).toBe('monster_golem')
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
    it('resolves event categories to default sprite', () => {
      expect(map.resolveEvent('error')).toBe('skull')
      expect(map.resolveEvent('deployment')).toBe('shovel')
      expect(map.resolveEvent('file_change')).toBe('saw')
      expect(map.resolveEvent('task')).toBe('banner_1')
      expect(map.resolveEvent('comms')).toBe('target_board')
      expect(map.resolveEvent('combat')).toBe('monster_boss_1')
    })

    it('resolves error severity levels', () => {
      expect(map.resolveEvent('error', 'warning')).toBe('monster_bat')
      expect(map.resolveEvent('error', 'error')).toBe('monster_slime')
      expect(map.resolveEvent('error', 'critical')).toBe('monster_spider')
      expect(map.resolveEvent('error', 'outage')).toBe('monster_rat')
    })

    it('falls back to default when severity not found', () => {
      expect(map.resolveEvent('error', 'unknown_severity')).toBe('skull')
    })

    it('falls back to skull for unknown categories', () => {
      expect(map.resolveEvent('unknown_category')).toBe('skull')
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

    it('getEventMap returns all configured events', () => {
      const eventMap = map.getEventMap()
      expect(Object.keys(eventMap)).toContain('error')
      expect(Object.keys(eventMap)).toContain('deployment')
      expect(eventMap['error']!['critical']).toBe('monster_spider')
    })

    it('getAgentTypeMap returns base sprite for each agent type', () => {
      const typeMap = map.getAgentTypeMap()
      expect(typeMap['claude']).toBe('hero_knight')
      expect(typeMap['cursor']).toBe('hero_rogue')
      expect(typeMap['codex']).toBe('hero_mage')
      expect(typeMap['gemini']).toBe('hero_ranger')
      expect(typeMap['openclaw']).toBe('hero_barb')
      expect(Object.keys(typeMap).length).toBe(5)
    })

    it('getAllAgentSpriteKeys returns deduplicated set of all variant keys', () => {
      const keys = map.getAllAgentSpriteKeys()
      // 5 agent types × 3 variants = 15, all unique
      expect(keys.length).toBe(15)
      expect(keys).toContain('hero_knight')
      expect(keys).toContain('npc_guard')
      expect(keys).toContain('hero_cleric')
      expect(keys).toContain('npc_assassin')
    })

    it('getMonsterSpriteMap returns severity → region key mapping', () => {
      const monsterMap = map.getMonsterSpriteMap()
      expect(monsterMap['bat']).toBe('monster_bat')
      expect(monsterMap['slime']).toBe('monster_slime')
      expect(monsterMap['spider']).toBe('monster_spider')
      expect(monsterMap['rat']).toBe('monster_rat')
      expect(Object.keys(monsterMap).length).toBe(4)
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
      expect(map.resolveEvent('error')).toBe('skull')
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
})
