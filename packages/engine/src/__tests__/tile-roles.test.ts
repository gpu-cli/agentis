// ============================================================================
// tile-roles — Unit tests for style normalization + material alpha
// ============================================================================

import { describe, it, expect } from 'vitest'

import {
  normalizeStyle,
  materialAlpha,
  BUILDING_ROLES,
  ROOF_ROLES,
  WALL_ROLES,
  ROAD_ROLES,
} from '../engine/tile-roles'
import type { BuildingArchetype } from '../engine/tile-roles'

// ---------------------------------------------------------------------------
// normalizeStyle
// ---------------------------------------------------------------------------

describe('normalizeStyle', () => {
  it('maps adapter SizeBand styles correctly', () => {
    expect(normalizeStyle('house')).toBe('residential')
    expect(normalizeStyle('large')).toBe('institutional')
    expect(normalizeStyle('tower')).toBe('tower')
  })

  it('maps legacy projector styles correctly', () => {
    expect(normalizeStyle('modern_office')).toBe('institutional')
    expect(normalizeStyle('library')).toBe('institutional')
    expect(normalizeStyle('factory')).toBe('industrial')
    expect(normalizeStyle('server_tower')).toBe('tower')
  })

  it('passes through direct archetype names', () => {
    expect(normalizeStyle('residential')).toBe('residential')
    expect(normalizeStyle('institutional')).toBe('institutional')
    expect(normalizeStyle('industrial')).toBe('industrial')
  })

  it('defaults unknown styles to residential', () => {
    expect(normalizeStyle('unknown')).toBe('residential')
    expect(normalizeStyle('')).toBe('residential')
    expect(normalizeStyle('castle')).toBe('residential')
  })

  it('returns one of the four valid archetypes', () => {
    const valid: BuildingArchetype[] = ['residential', 'institutional', 'industrial', 'tower']
    const inputs = [
      'house', 'large', 'tower', 'modern_office', 'library',
      'factory', 'server_tower', 'unknown', '', 'foobar',
    ]
    for (const input of inputs) {
      expect(valid).toContain(normalizeStyle(input))
    }
  })
})

// ---------------------------------------------------------------------------
// materialAlpha
// ---------------------------------------------------------------------------

describe('materialAlpha', () => {
  it('returns 1.0 for solid state', () => {
    expect(materialAlpha('solid')).toBe(1.0)
  })

  it('returns reduced alpha for ghost state', () => {
    const alpha = materialAlpha('ghost')
    expect(alpha).toBeLessThan(1.0)
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBe(0.45)
  })
})

// ---------------------------------------------------------------------------
// Role Constants — sanity checks
// ---------------------------------------------------------------------------

describe('role constants', () => {
  it('BUILDING_ROLES contains essential roles', () => {
    expect(BUILDING_ROLES).toContain('wall_tl')
    expect(BUILDING_ROLES).toContain('door')
    expect(BUILDING_ROLES).toContain('window')
  })

  it('ROOF_ROLES contains four corner roles', () => {
    expect(ROOF_ROLES).toHaveLength(4)
    expect(ROOF_ROLES).toContain('tl')
    expect(ROOF_ROLES).toContain('tr')
    expect(ROOF_ROLES).toContain('bl')
    expect(ROOF_ROLES).toContain('br')
  })

  it('WALL_ROLES contains gate roles', () => {
    expect(WALL_ROLES).toContain('gate_h')
    expect(WALL_ROLES).toContain('gate_v')
    expect(WALL_ROLES).toContain('isolated')
  })

  it('ROAD_ROLES contains all autotile variants', () => {
    expect(ROAD_ROLES).toContain('straight_h')
    expect(ROAD_ROLES).toContain('straight_v')
    expect(ROAD_ROLES).toContain('cross')
    expect(ROAD_ROLES).toContain('isolated')
    expect(ROAD_ROLES).toContain('end_n')
    expect(ROAD_ROLES).toContain('turn_ne')
  })
})
