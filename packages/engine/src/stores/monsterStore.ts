// ============================================================================
// World Model Store — Monster / Error State
// ============================================================================

import { create } from 'zustand'
import type {
  Monster,
  MonsterSeverity,
  MonsterStatus,
  WorldCoord,
} from '@multiverse/shared'
import { severityToMonsterType } from '@multiverse/shared'
import type { PlanetSnapshot } from '@multiverse/shared'

interface MonsterState {
  monsters: Map<string, Monster>

  // Actions
  loadSnapshot: (snapshot: PlanetSnapshot) => void
  spawnMonster: (params: {
    id: string
    planetId: string
    severity: MonsterSeverity
    position: WorldCoord
    buildingId?: string
    workitemId?: string
    message: string
    stackTrace?: string
  }) => void
  updateMonsterHealth: (monsterId: string, health: number) => void
  updateMonsterStatus: (monsterId: string, status: MonsterStatus) => void
  setFightingAgent: (monsterId: string, agentId: string | undefined) => void
  defeatMonster: (monsterId: string) => void
}

export const useMonsterStore = create<MonsterState>((set) => ({
  monsters: new Map(),

  loadSnapshot: (snapshot) => {
    set({
      monsters: new Map<string, Monster>(snapshot.monsters.map((m) => [m.id, m])),
    })
  },

  spawnMonster: (params) => {
    const monster: Monster = {
      id: params.id,
      planet_id: params.planetId,
      workitem_id: params.workitemId,
      severity: params.severity,
      monster_type: severityToMonsterType(params.severity),
      position: params.position,
      affected_tiles: [],
      affected_building_id: params.buildingId,
      status: 'spawned',
      health: 100,
      error_details: {
        message: params.message,
        stack_trace: params.stackTrace,
      },
      conversation_thread: [],
      spawned_at: Date.now(),
    }
    set((state) => {
      const monsters = new Map(state.monsters)
      monsters.set(monster.id, monster)
      return { monsters }
    })
  },

  updateMonsterHealth: (monsterId, health) => {
    set((state) => {
      const monsters = new Map(state.monsters)
      const monster = monsters.get(monsterId)
      if (monster) {
        monsters.set(monsterId, { ...monster, health: Math.max(0, health) })
      }
      return { monsters }
    })
  },

  updateMonsterStatus: (monsterId, status) => {
    set((state) => {
      const monsters = new Map(state.monsters)
      const monster = monsters.get(monsterId)
      if (monster) {
        monsters.set(monsterId, {
          ...monster,
          status,
          resolved_at: status === 'defeated' ? Date.now() : monster.resolved_at,
        })
      }
      return { monsters }
    })
  },

  setFightingAgent: (monsterId, agentId) => {
    set((state) => {
      const monsters = new Map(state.monsters)
      const monster = monsters.get(monsterId)
      if (monster) {
        monsters.set(monsterId, { ...monster, fighting_agent_id: agentId })
      }
      return { monsters }
    })
  },

  defeatMonster: (monsterId) => {
    set((state) => {
      const monsters = new Map(state.monsters)
      const monster = monsters.get(monsterId)
      if (monster) {
        monsters.set(monsterId, {
          ...monster,
          status: 'defeated',
          health: 0,
          resolved_at: Date.now(),
        })
      }
      return { monsters }
    })
  },
}))
