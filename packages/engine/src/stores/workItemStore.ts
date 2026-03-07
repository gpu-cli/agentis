// ============================================================================
// World Model Store — WorkItems (Quests / Tasks)
// ============================================================================

import { create } from 'zustand'
import type {
  WorkItem,
  WorkItemStatus,
  WorkItemType,
  WorkItemPriority,
} from '@multiverse/shared'
import type { PlanetSnapshot } from '@multiverse/shared'

interface WorkItemState {
  workItems: Map<string, WorkItem>

  // Actions
  loadSnapshot: (snapshot: PlanetSnapshot) => void
  addWorkItem: (params: {
    id: string
    planetId: string
    type: WorkItemType
    title: string
    status: WorkItemStatus
    priority?: WorkItemPriority
    assignedAgentId?: string
  }) => void
  updateWorkItemStatus: (workItemId: string, status: WorkItemStatus) => void
  updateWorkItem: (workItemId: string, updates: Partial<WorkItem>) => void
  assignAgent: (workItemId: string, agentId: string) => void
}

export const useWorkItemStore = create<WorkItemState>((set) => ({
  workItems: new Map(),

  loadSnapshot: (snapshot) => {
    set({
      workItems: new Map<string, WorkItem>(snapshot.work_items.map((w) => [w.id, w])),
    })
  },

  addWorkItem: (params) => {
    const workItem: WorkItem = {
      id: params.id,
      planet_id: params.planetId,
      type: params.type,
      title: params.title,
      status: params.status,
      priority: params.priority,
      assigned_agent_id: params.assignedAgentId,
      links: [],
      created_at: Date.now(),
    }
    set((state) => {
      const workItems = new Map(state.workItems)
      workItems.set(workItem.id, workItem)
      return { workItems }
    })
  },

  updateWorkItemStatus: (workItemId, status) => {
    set((state) => {
      const workItems = new Map(state.workItems)
      const existing = workItems.get(workItemId)
      if (existing) {
        workItems.set(workItemId, {
          ...existing,
          status,
          completed_at: status === 'done' ? Date.now() : existing.completed_at,
        })
      }
      return { workItems }
    })
  },

  updateWorkItem: (workItemId, updates) => {
    set((state) => {
      const workItems = new Map(state.workItems)
      const existing = workItems.get(workItemId)
      if (existing) {
        workItems.set(workItemId, { ...existing, ...updates })
      }
      return { workItems }
    })
  },

  assignAgent: (workItemId, agentId) => {
    set((state) => {
      const workItems = new Map(state.workItems)
      const existing = workItems.get(workItemId)
      if (existing) {
        workItems.set(workItemId, { ...existing, assigned_agent_id: agentId })
      }
      return { workItems }
    })
  },
}))
