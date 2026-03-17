import type { PipelineProgress } from './worker/pipelineRunner'

export type TranscriptState =
  | { phase: 'loading' }
  | { phase: 'onboarding'; warning?: string }
  | { phase: 'playing'; projectName: string; restoredFromStorage: boolean }

export interface TranscriptSizeWarning {
  projectedSize: number
  onContinue: () => void
  onCancel: () => void
}

export interface TranscriptSimulationWarning {
  message: string
  onContinue: () => void
  onCancel: () => void
}

export interface TranscriptReducerState {
  transcriptState: TranscriptState
  importError: string | null
  pipelineProgress: PipelineProgress | null
  importWarnings: string[]
  showWarningsBanner: boolean
  sizeWarning: TranscriptSizeWarning | null
  simWarning: TranscriptSimulationWarning | null
  showClearConfirm: boolean
}

export type TranscriptAction =
  | { type: 'setTranscriptState'; payload: TranscriptState }
  | { type: 'setImportError'; payload: string | null }
  | { type: 'setPipelineProgress'; payload: PipelineProgress | null }
  | { type: 'setImportWarnings'; payload: string[] }
  | { type: 'setShowWarningsBanner'; payload: boolean }
  | { type: 'setSizeWarning'; payload: TranscriptSizeWarning | null }
  | { type: 'setSimWarning'; payload: TranscriptSimulationWarning | null }
  | { type: 'setShowClearConfirm'; payload: boolean }

export const initialTranscriptState: TranscriptReducerState = {
  transcriptState: { phase: 'loading' },
  importError: null,
  pipelineProgress: null,
  importWarnings: [],
  showWarningsBanner: false,
  sizeWarning: null,
  simWarning: null,
  showClearConfirm: false,
}

export function transcriptReducer(
  state: TranscriptReducerState,
  action: TranscriptAction,
): TranscriptReducerState {
  switch (action.type) {
    case 'setTranscriptState':
      return { ...state, transcriptState: action.payload }
    case 'setImportError':
      return { ...state, importError: action.payload }
    case 'setPipelineProgress':
      return { ...state, pipelineProgress: action.payload }
    case 'setImportWarnings':
      return { ...state, importWarnings: action.payload }
    case 'setShowWarningsBanner':
      return { ...state, showWarningsBanner: action.payload }
    case 'setSizeWarning':
      return { ...state, sizeWarning: action.payload }
    case 'setSimWarning':
      return { ...state, simWarning: action.payload }
    case 'setShowClearConfirm':
      return { ...state, showClearConfirm: action.payload }
    default:
      return state
  }
}
