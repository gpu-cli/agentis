// ============================================================================
// Replay Bootstrap — Store initialization from ScenarioData
// ============================================================================

import type { PlanetSnapshot, ScenarioData } from '@multiverse/shared'
import { useUniverseStore } from '../stores/universeStore'
import { useAgentStore } from '../stores/agentStore'
import { useMonsterStore } from '../stores/monsterStore'
import { useWorkItemStore } from '../stores/workItemStore'
import { clearDispatchTimers, useEventStore } from '../stores/eventStore'
import { useUIStore } from '../stores/uiStore'

// ---------------------------------------------------------------------------
// Reset callback — allows WorldRenderer to listen for bootstrap resets
// without threading refs through React.
// ---------------------------------------------------------------------------

let onResetCallback: (() => void) | null = null

/** Register a callback that fires when bootstrapReplay() or resetAllStores() runs.
 *  WorldRenderer uses this to clear cached sprites/geometry. */
export function setOnResetCallback(cb: (() => void) | null): void {
  onResetCallback = cb
}

const EMPTY_SNAPSHOT: PlanetSnapshot = {
  snapshot_version: 1,
  planet_id: '',
  generated_at: 0,
  agent_cursors: {},
  islands: [],
  districts: [],
  buildings: [],
  tiles: [],
  agents: [],
  sub_agents: [],
  monsters: [],
  work_items: [],
  connections: [],
}

/**
 * Bootstrap all stores from a ScenarioData.
 * Loads the snapshot into universe/agent/monster/workitem stores
 * and resets the event store.
 */
export function bootstrapReplay(scenario: ScenarioData): void {
  clearDispatchTimers()
  useUniverseStore.getState().loadSnapshot(scenario.snapshot)
  useAgentStore.getState().loadSnapshot(scenario.snapshot)
  useMonsterStore.getState().loadSnapshot(scenario.snapshot)
  useWorkItemStore.getState().loadSnapshot(scenario.snapshot)
  useEventStore.getState().reset()
  useUIStore.getState().resetSelection()
  onResetCallback?.()
}

/** Reset all stores to empty state */
export function resetAllStores(): void {
  clearDispatchTimers()
  useUniverseStore.getState().loadSnapshot(EMPTY_SNAPSHOT)
  useAgentStore.getState().loadSnapshot(EMPTY_SNAPSHOT)
  useMonsterStore.getState().loadSnapshot(EMPTY_SNAPSHOT)
  useWorkItemStore.getState().loadSnapshot(EMPTY_SNAPSHOT)
  useEventStore.getState().reset()
  useUIStore.getState().resetSelection()
  onResetCallback?.()
}
