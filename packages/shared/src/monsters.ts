// ============================================================================
// Multiverse — Monster Type Definitions
// From: planning/ui-plans/ui-roadmap.md §1.4 Error Monsters
// ============================================================================

import type { MonsterSeverity, MonsterTypeName } from './types'

export interface MonsterTypeConfig {
  severity: MonsterSeverity
  name: MonsterTypeName
  label: string
  visual_style: string
  size: { width: number; height: number }
  description: string
}

/** Maps severity → monster type configuration (from §1.4 table) */
export const MONSTER_TYPES: Record<MonsterSeverity, MonsterTypeConfig> = {
  warning: {
    severity: 'warning',
    name: 'bat',
    label: 'Bat / Bug',
    visual_style: 'flying_creature',
    size: { width: 8, height: 8 },
    description: 'Warning, lint error, minor issue. Small, fluttering.',
  },
  error: {
    severity: 'error',
    name: 'slime',
    label: 'Slime / Gremlin',
    visual_style: 'cute_blob_green',
    size: { width: 16, height: 16 },
    description: 'Failed test, non-critical error. Blobby, green.',
  },
  critical: {
    severity: 'critical',
    name: 'spider',
    label: 'Spider / Troll',
    visual_style: 'multi_legged',
    size: { width: 24, height: 24 },
    description: 'Service degradation, build failure. Creepy, multi-legged.',
  },
  outage: {
    severity: 'outage',
    name: 'rat',
    label: 'Rat / Boss',
    visual_style: 'scurrying',
    size: { width: 32, height: 32 },
    description: 'Production outage, critical incident. Swarming, persistent.',
  },
}

/** Maps severity to monster type name */
export function severityToMonsterType(severity: MonsterSeverity): MonsterTypeName {
  return MONSTER_TYPES[severity].name
}
