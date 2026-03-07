// =============================================================================
// Scenario Persistence (Lite) — localStorage save/load/clear for snapshot-only
// Stores only the ScenarioData snapshot + minimal metadata (no events) to keep
// storage small and avoid large-blob failures.
// =============================================================================

import type { ScenarioData } from '@multiverse/shared'

const STORAGE_KEY = 'multiverse.transcript.scenario.v1'

export interface StoredScenarioLite {
  savedAt: string
  projectName: string
  snapshot: ScenarioData['snapshot']
  eventCount: number
}

export function saveScenarioLite(projectName: string, scenario: ScenarioData): boolean {
  try {
    const payload: StoredScenarioLite = {
      savedAt: new Date().toISOString(),
      projectName,
      snapshot: scenario.snapshot,
      eventCount: scenario.events.length,
    }
    const json = JSON.stringify(payload)
    // Guard: avoid storing very large snapshots (>5MB)
    if (json.length > 5 * 1024 * 1024) {
      console.warn('[scenario-persistence] skipping — snapshot too large')
      return false
    }
    localStorage.setItem(STORAGE_KEY, json)
    return true
  } catch (error) {
    console.warn('[scenario-persistence] save failed:', error)
    return false
  }
}

export function loadScenarioLite(): { status: 'found' | 'empty' | 'corrupt'; data?: StoredScenarioLite } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { status: 'empty' }
    try {
      const parsed = JSON.parse(raw) as StoredScenarioLite
      if (!parsed || typeof parsed.projectName !== 'string' || !parsed.snapshot) {
        localStorage.removeItem(STORAGE_KEY)
        return { status: 'corrupt' }
      }
      return { status: 'found', data: parsed }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      return { status: 'corrupt' }
    }
  } catch {
    return { status: 'corrupt' }
  }
}

export function clearScenarioLite(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

