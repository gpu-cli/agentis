// ============================================================================
// Replay Bootstrap — Store initialization from ScenarioData
// ============================================================================

import type { PlanetSnapshot, ScenarioData } from '@multiverse/shared'
import { useUniverseStore } from '../stores/universeStore'
import { useAgentStore } from '../stores/agentStore'
import { useMonsterStore } from '../stores/monsterStore'
import { useWorkItemStore } from '../stores/workItemStore'
import { useEventStore } from '../stores/eventStore'

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
  useUniverseStore.getState().loadSnapshot(scenario.snapshot)
  useAgentStore.getState().loadSnapshot(scenario.snapshot)
  useMonsterStore.getState().loadSnapshot(scenario.snapshot)
  useWorkItemStore.getState().loadSnapshot(scenario.snapshot)
  useEventStore.getState().reset()
}

/** Reset all stores to empty state */
export function resetAllStores(): void {
  useUniverseStore.getState().loadSnapshot(EMPTY_SNAPSHOT)
  useAgentStore.getState().loadSnapshot(EMPTY_SNAPSHOT)
  useMonsterStore.getState().loadSnapshot(EMPTY_SNAPSHOT)
  useWorkItemStore.getState().loadSnapshot(EMPTY_SNAPSHOT)
  useEventStore.getState().reset()
}
