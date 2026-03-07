// ============================================================================
// biome-materials — Unit tests for biome material resolution
// ============================================================================

import { describe, it, expect } from 'vitest'

import {
  resolveBiomeMaterials,
  BIOME_MATERIALS,
  DEFAULT_MATERIALS,
} from '../engine/biome-materials'


// ---------------------------------------------------------------------------
// resolveBiomeMaterials
// ---------------------------------------------------------------------------

describe('resolveBiomeMaterials', () => {
  it('resolves known biomes to their configured materials', () => {
    const urban = resolveBiomeMaterials('urban')
    expect(urban.wall).toBe('brick')
    expect(urban.roof).toBe('red')
    expect(urban.road).toBe('cobble')
    expect(urban.ground).toBe('grass')
  })

  it('resolves library biome to wood/brown', () => {
    const lib = resolveBiomeMaterials('library')
    expect(lib.wall).toBe('wood')
    expect(lib.roof).toBe('brown')
  })

  it('resolves industrial biome to stone', () => {
    const ind = resolveBiomeMaterials('industrial')
    expect(ind.wall).toBe('stone')
    expect(ind.road).toBe('path')
  })

  it('resolves observatory biome to grey/blue', () => {
    const obs = resolveBiomeMaterials('observatory')
    expect(obs.wall).toBe('grey')
    expect(obs.roof).toBe('blue')
  })

  it('resolves civic biome to castle', () => {
    const civic = resolveBiomeMaterials('civic')
    expect(civic.wall).toBe('castle')
  })

  it('returns defaults for unknown biome', () => {
    const unknown = resolveBiomeMaterials('alien_dimension')
    expect(unknown).toEqual(DEFAULT_MATERIALS)
  })

  it('returns defaults for undefined biome', () => {
    const undef = resolveBiomeMaterials(undefined)
    expect(undef).toEqual(DEFAULT_MATERIALS)
  })

  it('returns defaults for empty string biome', () => {
    const empty = resolveBiomeMaterials('')
    expect(empty).toEqual(DEFAULT_MATERIALS)
  })
})

// ---------------------------------------------------------------------------
// BIOME_MATERIALS completeness
// ---------------------------------------------------------------------------

describe('BIOME_MATERIALS', () => {
  it('defines materials for all expected biomes', () => {
    const expectedBiomes = ['urban', 'library', 'industrial', 'observatory', 'arts', 'harbor', 'civic', 'plains']
    for (const biome of expectedBiomes) {
      expect(BIOME_MATERIALS[biome]).toBeDefined()
    }
  })

  it('every biome material set has all four required keys', () => {
    for (const [biome, mats] of Object.entries(BIOME_MATERIALS)) {
      expect(mats.wall, `${biome}.wall`).toBeTruthy()
      expect(mats.roof, `${biome}.roof`).toBeTruthy()
      expect(mats.road, `${biome}.road`).toBeTruthy()
      expect(mats.ground, `${biome}.ground`).toBeTruthy()
    }
  })

  it('wall materials are valid Kenney material keys', () => {
    const validWalls = ['brick', 'wood', 'stone', 'grey', 'castle', 'fortress']
    for (const [, mats] of Object.entries(BIOME_MATERIALS)) {
      expect(validWalls).toContain(mats.wall)
    }
  })

  it('roof materials are valid Kenney roof colors', () => {
    const validRoofs = ['red', 'blue', 'brown']
    for (const [, mats] of Object.entries(BIOME_MATERIALS)) {
      expect(validRoofs).toContain(mats.roof)
    }
  })

  it('road materials are valid road types', () => {
    const validRoads = ['cobble', 'path']
    for (const [, mats] of Object.entries(BIOME_MATERIALS)) {
      expect(validRoads).toContain(mats.road)
    }
  })
})

// ---------------------------------------------------------------------------
// DEFAULT_MATERIALS
// ---------------------------------------------------------------------------

describe('DEFAULT_MATERIALS', () => {
  it('provides sensible defaults', () => {
    expect(DEFAULT_MATERIALS.wall).toBe('brick')
    expect(DEFAULT_MATERIALS.roof).toBe('red')
    expect(DEFAULT_MATERIALS.road).toBe('path')
    expect(DEFAULT_MATERIALS.ground).toBe('grass')
  })
})
