// ============================================================================
// World Model Store — Tool Definitions
// ============================================================================

import { create } from 'zustand'
import type { ToolDefinition } from '@multiverse/shared'
import { DEFAULT_TOOLS } from '@multiverse/shared'

interface ToolState {
  tools: Map<string, ToolDefinition>

  // Actions
  loadDefaults: () => void
  getToolById: (toolId: string) => ToolDefinition | undefined
  getToolByKey: (key: string) => ToolDefinition | undefined
}

export const useToolStore = create<ToolState>((set, get) => ({
  tools: new Map(),

  loadDefaults: () => {
    const tools = new Map<string, ToolDefinition>()
    for (const tool of Object.values(DEFAULT_TOOLS)) {
      tools.set(tool.id, tool)
    }
    set({ tools })
  },

  getToolById: (toolId) => {
    return get().tools.get(toolId)
  },

  getToolByKey: (key) => {
    for (const tool of get().tools.values()) {
      if (tool.key === key) return tool
    }
    return undefined
  },
}))
