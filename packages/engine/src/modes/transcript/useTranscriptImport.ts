// ============================================================================
// useTranscriptImport — Pipeline execution, import handling, and reset actions
// ============================================================================

import { useCallback, type Dispatch } from 'react'
import type { ScenarioData } from '@multiverse/shared'
import { validateFileSize } from '@multiverse/ingest/browser'
import { estimateBudget } from '@multiverse/world-model'
import { runPipeline } from './worker/pipelineRunner'
import { readFilesToContents, tryCreatePipelineWorker, runPipelineViaWorker } from './pipelineHelpers'
import { clearTranscript } from './transcriptPersistence'
import { saveScenarioLite } from './scenarioPersistence'
import { resetAllStores } from '../../replay/bootstrap'
import { formatBytes } from '../../utils/formatting'
import type { TranscriptAction } from './useTranscriptReducer'

interface UseTranscriptImportOptions {
  engine: {
    loadScenario: (scenario: ScenarioData) => void
  }
  dispatch: Dispatch<TranscriptAction>
  setShowRestoredBanner: (show: boolean) => void
}

export function useTranscriptImport({ engine, dispatch, setShowRestoredBanner }: UseTranscriptImportOptions) {
  /** Core pipeline execution — used by both Worker and main-thread paths */
  const executePipeline = useCallback(
    async (projectName: string, files: File[]): Promise<boolean> => {
      dispatch({ type: 'setImportError', payload: null })
      dispatch({ type: 'setPipelineProgress', payload: null })
      dispatch({ type: 'setImportWarnings', payload: [] })
      dispatch({ type: 'setShowWarningsBanner', payload: false })

      try {
        const totalSize = files.reduce((sum, f) => sum + f.size, 0)
        const fileContents = await readFilesToContents(files)

        // Try Worker first, fall back to main-thread runPipeline
        const worker = tryCreatePipelineWorker()

        // Require Workers for large imports to avoid main-thread crashes
        const MAIN_THREAD_MAX_TOTAL_SIZE = 5 * 1024 * 1024 // 5MB

        if (!worker && totalSize > MAIN_THREAD_MAX_TOTAL_SIZE) {
          const msg = `This import is ${formatBytes(totalSize)}. Web Workers are required for large transcripts. ` +
            `Please use a modern browser with Workers enabled.`
          throw new Error(msg)
        }

        const v3Result = await (worker
          ? runPipelineViaWorker(worker, projectName, fileContents, (progress) => {
              dispatch({ type: 'setPipelineProgress', payload: progress })
            })
          : runPipeline(projectName, fileContents, (progress) => {
              dispatch({ type: 'setPipelineProgress', payload: progress })
            }))

        if (v3Result.warnings.length > 0) {
          console.warn('[transcript] V3 import warnings:', v3Result.warnings)
          dispatch({ type: 'setImportWarnings', payload: v3Result.warnings })
          dispatch({ type: 'setShowWarningsBanner', payload: true })
        }

        // Preflight: run budget estimator for detailed size/compute warnings
        const scenario: ScenarioData = v3Result.scenario
        const budget = estimateBudget(scenario.snapshot, scenario.events.length)
        if (budget.warnings.length > 0) {
          const lines = budget.warnings.join('\n')
          const proceed = budget.canProceed
          await new Promise<void>((resolve, reject) => {
            dispatch({
              type: 'setSimWarning',
              payload: {
                message: proceed
                  ? `${lines}\n\nPlayback will use a worker and throttle UI updates. Continue?`
                  : `${lines}\n\nThis run exceeds safe limits and may crash. Continue anyway?`,
                onContinue: () => {
                  dispatch({ type: 'setSimWarning', payload: null })
                  resolve()
                },
                onCancel: () => {
                  dispatch({ type: 'setSimWarning', payload: null })
                  reject(new Error('Import canceled by user'))
                },
              },
            })
          })
        }

        engine.loadScenario(scenario)

        // Best-effort persistence of snapshot-only (lite)
        try {
          saveScenarioLite(projectName, v3Result.scenario)
        } catch {
          // ignore persistence errors
        }

        dispatch({ type: 'setPipelineProgress', payload: null })
        dispatch({
          type: 'setTranscriptState',
          payload: {
            phase: 'playing',
            projectName,
            restoredFromStorage: false,
          },
        })
        return true
      } catch (error) {
        dispatch({ type: 'setPipelineProgress', payload: null })
        const message = error instanceof Error ? error.message : 'Unable to parse Claude transcripts'
        dispatch({ type: 'setImportError', payload: message })
        return false
      }
    },
    [engine, dispatch],
  )

  const handleImport = useCallback(
    async (projectName: string, files: File[]): Promise<boolean> => {
      const sizeResult = validateFileSize(files)

      if (!sizeResult.valid) {
        dispatch({ type: 'setImportError', payload: sizeResult.errors.join('; ') })
        return false
      }

      if (sizeResult.warnings.length > 0) {
        return new Promise<boolean>((resolve) => {
          const totalSize = files.reduce((sum, f) => sum + f.size, 0)
          dispatch({
            type: 'setSizeWarning',
            payload: {
              projectedSize: totalSize,
              onContinue: () => {
                dispatch({ type: 'setSizeWarning', payload: null })
                executePipeline(projectName, files).then(resolve)
              },
              onCancel: () => {
                dispatch({ type: 'setSizeWarning', payload: null })
                resolve(false)
              },
            },
          })
        })
      }

      return executePipeline(projectName, files)
    },
    [executePipeline, dispatch],
  )

  const resetState = useCallback(() => {
    dispatch({ type: 'setTranscriptState', payload: { phase: 'onboarding' } })
    setShowRestoredBanner(false)
    dispatch({ type: 'setImportError', payload: null })
    dispatch({ type: 'setImportWarnings', payload: [] })
    dispatch({ type: 'setShowWarningsBanner', payload: false })
    dispatch({ type: 'setSizeWarning', payload: null })
  }, [dispatch, setShowRestoredBanner])

  const handleReplace = useCallback(() => {
    resetState()
  }, [resetState])

  const handleClear = useCallback(() => {
    clearTranscript()
    resetAllStores()
    resetState()
  }, [resetState])

  return { handleImport, handleReplace, handleClear }
}
