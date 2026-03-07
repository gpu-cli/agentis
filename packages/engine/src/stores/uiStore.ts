// ============================================================================
// UI State Store — Toggles, Camera, Selections
// ============================================================================

import { create } from 'zustand'

export type DataDensity = 'minimal' | 'normal' | 'dense'
export type ZoomTier =
  | 'universe'
  | 'orbital'
  | 'island'
  | 'district'
  | 'street'
  | 'interior'

interface UIState {
  // Mode toggles (all independent)
  powerUserMode: boolean
  seriousMode: boolean
  reduceMotion: boolean
  dataDensity: DataDensity

  // Camera state
  zoomTier: ZoomTier
  followAgentId: string | null

  // Conversation
  conversationAgentId: string | null

  // Hover
  hoveredEntityId: string | null
  hoveredEntityType: 'agent' | 'monster' | 'workitem' | 'building' | 'district' | null

  // Selection
  selectedEntityId: string | null
  selectedEntityType: 'agent' | 'monster' | 'workitem' | 'building' | 'district' | null

  // Panel visibility
  agentPanelOpen: boolean
  monsterPanelOpen: boolean
  workItemPanelOpen: boolean
  buildingPanelOpen: boolean
  districtPanelOpen: boolean

  // Actions
  togglePowerUser: () => void
  toggleSeriousMode: () => void
  toggleReduceMotion: () => void
  setDataDensity: (density: DataDensity) => void
  setZoomTier: (tier: ZoomTier) => void
  setFollowAgent: (agentId: string | null) => void
  setConversationAgent: (agentId: string | null) => void
  hoverEntity: (
    id: string | null,
    type: 'agent' | 'monster' | 'workitem' | 'building' | 'district' | null,
  ) => void
  selectEntity: (
    id: string | null,
    type: 'agent' | 'monster' | 'workitem' | 'building' | 'district' | null,
  ) => void
  clearSelection: () => void
}

export const useUIStore = create<UIState>((set) => ({
  powerUserMode: false,
  seriousMode: false,
  reduceMotion: false,
  dataDensity: 'normal',

  zoomTier: 'district',
  followAgentId: null,

  conversationAgentId: null,

  hoveredEntityId: null,
  hoveredEntityType: null,

  selectedEntityId: null,
  selectedEntityType: null,
  agentPanelOpen: false,
  monsterPanelOpen: false,
  workItemPanelOpen: false,
  buildingPanelOpen: false,
  districtPanelOpen: false,

  togglePowerUser: () =>
    set((state) => ({ powerUserMode: !state.powerUserMode })),
  toggleSeriousMode: () =>
    set((state) => ({ seriousMode: !state.seriousMode })),
  toggleReduceMotion: () =>
    set((state) => ({ reduceMotion: !state.reduceMotion })),
  setDataDensity: (density) => set({ dataDensity: density }),
  setZoomTier: (tier) => set({ zoomTier: tier }),
  setFollowAgent: (agentId) => set({ followAgentId: agentId }),
  setConversationAgent: (agentId) => set({ conversationAgentId: agentId }),

  hoverEntity: (id, type) => set({ hoveredEntityId: id, hoveredEntityType: type }),

  selectEntity: (id, type) => {
    set((state) => ({
      selectedEntityId: id,
      selectedEntityType: type,
      agentPanelOpen: type === 'agent',
      monsterPanelOpen: type === 'monster',
      workItemPanelOpen: type === 'workitem',
      buildingPanelOpen: type === 'building',
      districtPanelOpen: type === 'district',
      // Clear chat when switching away from an agent or selecting a different agent
      conversationAgentId:
        type !== 'agent' || id !== state.conversationAgentId ? null : state.conversationAgentId,
    }))
  },

  clearSelection: () =>
    set({
      selectedEntityId: null,
      selectedEntityType: null,
      conversationAgentId: null,
      agentPanelOpen: false,
      monsterPanelOpen: false,
      workItemPanelOpen: false,
      buildingPanelOpen: false,
      districtPanelOpen: false,
    }),
}))
