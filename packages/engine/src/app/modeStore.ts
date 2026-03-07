// ============================================================================
// Mode Store — Controls which app mode is active (demo vs transcript)
// ============================================================================

import { create } from 'zustand'
import { resetAllStores } from '../replay/bootstrap'

export type AppMode = 'demo' | 'transcript'

interface ModeState {
  /** Current app mode. null = mode selection screen */
  mode: AppMode | null

  /** Set the active mode and reset all world stores */
  setMode: (mode: AppMode) => void

  /** Return to mode selection and reset all world stores */
  resetMode: () => void
}

export const useModeStore = create<ModeState>((set) => ({
  mode: null,

  setMode: (mode) => {
    resetAllStores()
    set({ mode })
  },

  resetMode: () => {
    resetAllStores()
    set({ mode: null })
  },
}))
