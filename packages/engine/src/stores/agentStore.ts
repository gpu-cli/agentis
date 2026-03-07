// ============================================================================
// World Model Store — Agent State
// ============================================================================

import { create } from 'zustand'
import type {
  Agent,
  AgentStatus,
  SubAgent,
  TaskInfo,
  WorldCoord,
} from '@multiverse/shared'
import type { PlanetSnapshot } from '@multiverse/shared'
import { entitySprites } from '../engine/entity-sprite-map'

interface AgentState {
  agents: Map<string, Agent>
  subAgents: Map<string, SubAgent>
  /** Maps agent ID → assigned sprite region key (deterministic via EntitySpriteMap).
   *  Shared between PixiJS AgentManager and React panels (AgentPanel). */
  spriteAssignment: Map<string, string>

  // Actions
  loadSnapshot: (snapshot: PlanetSnapshot) => void
  updateAgentPosition: (agentId: string, position: WorldCoord) => void
  setAgentStatus: (agentId: string, status: AgentStatus) => void
  setActiveTool: (agentId: string, toolId: string | undefined) => void
  setCurrentTask: (agentId: string, task: TaskInfo | undefined) => void
  incrementToolUsage: (agentId: string, toolId: string) => void
  /** Batch multiple agent mutations into a single Map clone + single set() */
  batchUpdate: (fn: (agents: Map<string, Agent>) => void) => void
  /** Get the assigned sprite key for an agent, assigning one if needed */
  getOrAssignSprite: (agentId: string) => string
  addSubAgent: (subAgent: SubAgent) => void
  updateSubAgent: (subAgentId: string, updates: Partial<SubAgent>) => void
  removeSubAgent: (subAgentId: string) => void
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: new Map(),
  subAgents: new Map(),
  spriteAssignment: new Map(),

  loadSnapshot: (snapshot) => {
    set({
      agents: new Map<string, Agent>(snapshot.agents.map((a) => [a.id, a])),
      subAgents: new Map<string, SubAgent>(snapshot.sub_agents.map((s) => [s.id, s])),
      spriteAssignment: new Map(),
    })
  },

  updateAgentPosition: (agentId, position) => {
    set((state) => {
      const agents = new Map(state.agents)
      const agent = agents.get(agentId)
      if (agent) {
        agents.set(agentId, { ...agent, position })
      }
      return { agents }
    })
  },

  setAgentStatus: (agentId, status) => {
    set((state) => {
      const agents = new Map(state.agents)
      const agent = agents.get(agentId)
      if (agent) {
        agents.set(agentId, { ...agent, status })
      }
      return { agents }
    })
  },

  setActiveTool: (agentId, toolId) => {
    set((state) => {
      const agents = new Map(state.agents)
      const agent = agents.get(agentId)
      if (agent) {
        agents.set(agentId, { ...agent, active_tool: toolId })
      }
      return { agents }
    })
  },

  setCurrentTask: (agentId, task) => {
    set((state) => {
      const agents = new Map(state.agents)
      const agent = agents.get(agentId)
      if (agent) {
        agents.set(agentId, { ...agent, current_task: task })
      }
      return { agents }
    })
  },

  incrementToolUsage: (agentId, toolId) => {
    set((state) => {
      const agents = new Map(state.agents)
      const agent = agents.get(agentId)
      if (agent) {
        const tools: Agent['tools'] = agent.tools.map((t) =>
          t.tool_id === toolId
            ? { ...t, usage_count: t.usage_count + 1, last_used: Date.now() }
            : t,
        )
        agents.set(agentId, { ...agent, tools })
      }
      return { agents }
    })
  },

  batchUpdate: (fn) => {
    set((state) => {
      const agents = new Map(state.agents)
      fn(agents)
      return { agents }
    })
  },

  getOrAssignSprite: (agentId) => {
    const existing = get().spriteAssignment.get(agentId)
    if (existing) return existing

    // Type-locked deterministic selection via EntitySpriteMap
    const agent = get().agents.get(agentId)
    const agentType = agent?.type ?? 'claude'
    const key = entitySprites.resolveAgent(agentType, agentId)

    set((state) => {
      const spriteAssignment = new Map(state.spriteAssignment)
      spriteAssignment.set(agentId, key)
      return { spriteAssignment }
    })
    return key
  },

  addSubAgent: (subAgent) => {
    set((state) => {
      const subAgents = new Map(state.subAgents)
      subAgents.set(subAgent.id, subAgent)
      return { subAgents }
    })
  },

  updateSubAgent: (subAgentId, updates) => {
    set((state) => {
      const subAgents = new Map(state.subAgents)
      const existing = subAgents.get(subAgentId)
      if (existing) {
        subAgents.set(subAgentId, { ...existing, ...updates })
      }
      return { subAgents }
    })
  },

  removeSubAgent: (subAgentId) => {
    set((state) => {
      const subAgents = new Map(state.subAgents)
      subAgents.delete(subAgentId)
      return { subAgents }
    })
  },
}))
