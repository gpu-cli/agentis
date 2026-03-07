// ============================================================================
// V4 Budget Estimator — Preflight size/compute projection from snapshot
// ============================================================================

import type { PlanetSnapshot } from '@multiverse/shared'

// ---------------------------------------------------------------------------
// Budget constants (bytes per entity in renderer memory)
// ---------------------------------------------------------------------------

export const BYTES_PER_ISLAND = 2048
export const BYTES_PER_DISTRICT = 4096
export const BYTES_PER_BUILDING = 8192
export const BYTES_PER_TILE = 512
export const BYTES_PER_EVENT = 256
export const BYTES_PER_AGENT = 1024

export const MS_PER_EVENT_APPLY = 0.05 // ~50μs per event application

export const HEAP_BUDGET_WARN = 512 * 1024 * 1024 // 512 MB
export const HEAP_BUDGET_MAX = 1024 * 1024 * 1024 // 1 GB

export const MAX_TILES_WARN = 5_000
export const MAX_TILES_HARD = 20_000
export const MAX_EVENTS_WARN = 50_000
export const MAX_EVENTS_HARD = 200_000

// ---------------------------------------------------------------------------
// Estimate result
// ---------------------------------------------------------------------------

export interface BudgetEstimate {
  estimatedHeapBytes: number
  estimatedEventWorkMs: number
  islandCount: number
  districtCount: number
  buildingCount: number
  tileCount: number
  eventCount: number
  agentCount: number
  tier: 'small' | 'medium' | 'large' | 'extreme'
  warnings: string[]
  canProceed: boolean
}

// ---------------------------------------------------------------------------
// Estimator
// ---------------------------------------------------------------------------

export function estimateBudget(
  snapshot: PlanetSnapshot,
  eventCount: number,
): BudgetEstimate {
  const islandCount = snapshot.islands.length
  const districtCount = snapshot.districts.length
  const buildingCount = snapshot.buildings.length
  const tileCount = snapshot.tiles.length
  const agentCount = snapshot.agents.length

  const estimatedHeapBytes =
    islandCount * BYTES_PER_ISLAND +
    districtCount * BYTES_PER_DISTRICT +
    buildingCount * BYTES_PER_BUILDING +
    tileCount * BYTES_PER_TILE +
    eventCount * BYTES_PER_EVENT +
    agentCount * BYTES_PER_AGENT

  const estimatedEventWorkMs = eventCount * MS_PER_EVENT_APPLY

  // Tier classification
  let tier: BudgetEstimate['tier']
  if (eventCount < 1_000) tier = 'small'
  else if (eventCount < 10_000) tier = 'medium'
  else if (eventCount < 100_000) tier = 'large'
  else tier = 'extreme'

  const warnings: string[] = []
  let canProceed = true

  // Heap warnings
  if (estimatedHeapBytes > HEAP_BUDGET_MAX) {
    warnings.push(
      `Projected heap usage (${formatMB(estimatedHeapBytes)}) exceeds hard limit (${formatMB(HEAP_BUDGET_MAX)}). This run will likely crash.`,
    )
    canProceed = false
  } else if (estimatedHeapBytes > HEAP_BUDGET_WARN) {
    warnings.push(
      `Projected heap usage (${formatMB(estimatedHeapBytes)}) is high. Performance may degrade on some devices.`,
    )
  }

  // Tile warnings
  if (tileCount > MAX_TILES_HARD) {
    warnings.push(
      `${tileCount.toLocaleString()} tiles exceeds the hard limit of ${MAX_TILES_HARD.toLocaleString()}. Rendering will be unstable.`,
    )
    canProceed = false
  } else if (tileCount > MAX_TILES_WARN) {
    warnings.push(
      `${tileCount.toLocaleString()} tiles is above the recommended limit. Per-tile labels will be suppressed.`,
    )
  }

  // Event warnings
  if (eventCount > MAX_EVENTS_HARD) {
    warnings.push(
      `${eventCount.toLocaleString()} events exceeds the hard limit of ${MAX_EVENTS_HARD.toLocaleString()}. Processing may hang.`,
    )
    canProceed = false
  } else if (eventCount > MAX_EVENTS_WARN) {
    warnings.push(
      `${eventCount.toLocaleString()} events is large. Playback at high speed may drop frames.`,
    )
  }

  return {
    estimatedHeapBytes,
    estimatedEventWorkMs,
    islandCount,
    districtCount,
    buildingCount,
    tileCount,
    eventCount,
    agentCount,
    tier,
    warnings,
    canProceed,
  }
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}
