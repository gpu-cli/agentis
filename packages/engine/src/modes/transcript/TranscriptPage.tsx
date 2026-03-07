// ============================================================================
// Transcript Page — Upload Claude transcripts, generate + replay
// Uses browser ingest pipeline (no legacy useScenarioReplay hook)
// V3 pipeline runs via Web Worker when available, main-thread fallback otherwise
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { GameCanvas } from '../../components/GameCanvas'
import { AgentPanel } from '../../components/AgentPanel'
import { BuildingPanel } from '../../components/BuildingPanel'
import { DistrictPanel } from '../../components/DistrictPanel'
import { MonsterPanel } from '../../components/MonsterPanel'
import { FollowBadge } from '../../components/FollowBadge'
import { EventLog } from '../../components/EventLog'
import { useUIStore } from '../../stores/uiStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
} from '@multiverse/ui'
import { useModeStore } from '../../app/modeStore'
import { useReplayEngine } from '../../replay/useReplayEngine'
import { resetAllStores } from '../../replay/bootstrap'
import { TranscriptImportScreen } from './TranscriptImportScreen'
import {
  clearTranscript,
} from './transcriptPersistence'
import { saveScenarioLite } from './scenarioPersistence'
import {
  validateFileSize,
} from '@multiverse/ingest/browser'
import { runPipeline, type PipelineProgress } from './worker/pipelineRunner'
import type { ScenarioData } from '@multiverse/shared'
import { estimateBudget } from '@multiverse/world-model'
import type { WorldRenderer } from '../../engine/WorldRenderer'

const SPEED_OPTIONS = [1, 5, 10, 100]

/** Human-readable labels for pipeline stages */
const STAGE_LABELS: Record<PipelineProgress['stage'], string> = {
  parse: 'Parsing transcripts...',
  canonicalize: 'Canonicalizing operations...',
  model: 'Building work model...',
  layout: 'Solving layout...',
  complete: 'Complete',
}

/**
 * Read File[] to plain objects that can be transferred to a Web Worker.
 * Workers cannot receive File objects, so we pre-read the text content.
 */
async function readFilesToContents(
  files: File[],
): Promise<Array<{ name: string; content: string }>> {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      content: await file.text(),
    })),
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * Try to construct a Web Worker for the pipeline.
 * Returns null if Workers are unsupported or construction fails.
 */
function tryCreatePipelineWorker(): Worker | null {
  try {
    if (typeof Worker === 'undefined') return null
    return new Worker(
      new URL('./worker/pipeline.worker.ts', import.meta.url),
      { type: 'module' },
    )
  } catch {
    return null
  }
}

/**
 * Execute the pipeline inside a Web Worker, returning a promise.
 * The worker is terminated on completion or error.
 */
function runPipelineViaWorker(
  worker: Worker,
  projectName: string,
  fileContents: Array<{ name: string; content: string }>,
  onProgress: (progress: PipelineProgress) => void,
): Promise<import('./worker/pipelineRunner').PipelineResult> {
  return new Promise((resolve, reject) => {
    // Accumulators for chunked mode
    let scenarioBase: import('@multiverse/shared').ScenarioData | null = null
    const eventChunks: import('@multiverse/shared').AgentEvent[] = []
    let warnings: string[] = []
    let projectedUncompressedSize = 0

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as { type: string; [key: string]: unknown }
      switch (msg.type) {
        case 'log': {
          const level = (msg.level as 'log' | 'info' | 'warn' | 'error') ?? 'log'
          const args = (msg.args as unknown[]) ?? []
          // Mirror worker logs to main-thread console
          // eslint-disable-next-line no-console
          ;(console as any)[level](...args)
          break
        }
        case 'progress':
          onProgress({
            stage: msg.stage as PipelineProgress['stage'],
            percent: msg.percent as number,
          })
          break
        case 'scenario':
          scenarioBase = msg.scenario as import('@multiverse/shared').ScenarioData
          warnings = msg.warnings as string[]
          projectedUncompressedSize = msg.projectedUncompressedSize as number
          break
        case 'events_chunk':
          eventChunks.push(...(msg.chunk as import('@multiverse/shared').AgentEvent[]))
          break
        case 'complete': {
          worker.terminate()
          // If we received a scenario base and chunks, assemble result
          if (scenarioBase) {
            resolve({
              scenario: { ...scenarioBase, events: eventChunks },
              warnings,
              projectedUncompressedSize,
            })
            break
          }
          // Back-compat path: complete carries everything
          resolve({
            scenario: msg.scenario as import('@multiverse/shared').ScenarioData,
            warnings: (msg.warnings as string[]) ?? [],
            projectedUncompressedSize: (msg.projectedUncompressedSize as number) ?? 0,
          })
          break
        }
        case 'error':
          worker.terminate()
          reject(new Error(msg.message as string))
          break
      }
    }
    worker.onerror = (err) => {
      worker.terminate()
      reject(new Error(err.message ?? 'Worker failed'))
    }
    worker.postMessage({ type: 'start', projectName, fileContents })
  })
}

/** Expandable warnings banner shown after import */
function WarningsBanner({ warnings, onDismiss }: { warnings: string[]; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-yellow-900/50 border-b border-yellow-700/50 px-4 py-2 shrink-0">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs text-yellow-200 hover:text-yellow-100 transition-colors"
        >
          <span>{expanded ? '▼' : '▶'}</span>
          <span>{warnings.length} warning(s) during import</span>
        </button>
        <button
          onClick={onDismiss}
          className="text-yellow-400 hover:text-yellow-200 text-xs ml-4"
        >
          Dismiss
        </button>
      </div>
      {expanded && (
        <div className="mt-2 max-h-32 overflow-auto bg-yellow-950/40 rounded p-2 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="text-[10px] font-mono text-yellow-300/80">{w}</div>
          ))}
        </div>
      )}
    </div>
  )
}

type TranscriptState =
  | { phase: 'loading' }
  | { phase: 'onboarding'; warning?: string }
  | { phase: 'playing'; projectName: string; restoredFromStorage: boolean }

export function TranscriptPage() {
  const zoomTier = useUIStore((s) => s.zoomTier)
  const resetMode = useModeStore((s) => s.resetMode)
  const engine = useReplayEngine()

  const [transcriptState, setTranscriptState] = useState<TranscriptState>({ phase: 'loading' })
  const [showRestoredBanner, setShowRestoredBanner] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null)
  const [importWarnings, setImportWarnings] = useState<string[]>([])
  const [showWarningsBanner, setShowWarningsBanner] = useState(false)
  const [sizeWarning, setSizeWarning] = useState<{
    projectedSize: number
    onContinue: () => void
    onCancel: () => void
  } | null>(null)
  const [simWarning, setSimWarning] = useState<{
    message: string
    onContinue: () => void
    onCancel: () => void
  } | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const initialized = useRef(false)
  const workerRef = useRef<Worker | null>(null)
  const rendererRef = useRef<WorldRenderer | null>(null)

  // V4 telemetry HUD — enabled via ?hud=1 query param or window.__MV_V4_HUD__
  const showHud = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('hud') === '1' || (window as any).__MV_V4_HUD__ === true)
    : false
  const [hudData, setHudData] = useState<{
    frameTimeP95: number
    diffRate: number
    heapMB: number
    eventThroughput: number
  } | null>(null)

  // TODO: localStorage hydration disabled — layout differs on reload vs fresh import.
  // Re-enable once layout is deterministic across sessions.
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    setTranscriptState({ phase: 'onboarding' })
  }, [engine])

  // Dismiss restored banner after 6 seconds
  useEffect(() => {
    if (!showRestoredBanner) return
    const timer = setTimeout(() => setShowRestoredBanner(false), 6000)
    return () => clearTimeout(timer)
  }, [showRestoredBanner])

  /** Core pipeline execution — used by both Worker and main-thread paths */
  const executePipeline = useCallback(
    async (projectName: string, files: File[]): Promise<boolean> => {
      setImportError(null)
      setPipelineProgress(null)
      setImportWarnings([])
      setShowWarningsBanner(false)

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
          ? runPipelineViaWorker(worker, projectName, fileContents, setPipelineProgress)
          : runPipeline(projectName, fileContents, (progress) => {
              setPipelineProgress(progress)
            }))

        if (v3Result.warnings.length > 0) {
          console.warn('[transcript] V3 import warnings:', v3Result.warnings)
          setImportWarnings(v3Result.warnings)
          setShowWarningsBanner(true)
        }
        // Preflight: run budget estimator for detailed size/compute warnings
        const scenario: ScenarioData = v3Result.scenario
        const budget = estimateBudget(scenario.snapshot, scenario.events.length)
        if (budget.warnings.length > 0) {
          const lines = budget.warnings.join('\n')
          const proceed = budget.canProceed
          await new Promise<void>((resolve, reject) => {
            setSimWarning({
              message: proceed
                ? `${lines}\n\nPlayback will use a worker and throttle UI updates. Continue?`
                : `${lines}\n\nThis run exceeds safe limits and may crash. Continue anyway?`,
              onContinue: () => { setSimWarning(null); resolve() },
              onCancel: () => { setSimWarning(null); reject(new Error('Import canceled by user')) },
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

        setPipelineProgress(null)
        setTranscriptState({
          phase: 'playing',
          projectName,
          restoredFromStorage: false,
        })
        return true
      } catch (error) {
        setPipelineProgress(null)
        const message = error instanceof Error ? error.message : 'Unable to parse Claude transcripts'
        setImportError(message)
        return false
      }
    },
    [engine],
  )

  const handleImport = useCallback(
    async (projectName: string, files: File[]): Promise<boolean> => {
      // Run size validation before starting the pipeline
      const sizeResult = validateFileSize(files)

      if (!sizeResult.valid) {
        setImportError(sizeResult.errors.join('; '))
        return false
      }

      if (sizeResult.warnings.length > 0) {
        // Show continue/cancel dialog and wait for user decision
        return new Promise<boolean>((resolve) => {
          const totalSize = files.reduce((sum, f) => sum + f.size, 0)
          setSizeWarning({
            projectedSize: totalSize,
            onContinue: () => {
              setSizeWarning(null)
              executePipeline(projectName, files).then(resolve)
            },
            onCancel: () => {
              setSizeWarning(null)
              resolve(false)
            },
          })
        })
      }

      return executePipeline(projectName, files)
    },
    [executePipeline],
  )

  const handleReplace = useCallback(() => {
    setTranscriptState({ phase: 'onboarding' })
    setShowRestoredBanner(false)
    setImportError(null)
    setImportWarnings([])
    setShowWarningsBanner(false)
    setSizeWarning(null)
  }, [])

  const handleClear = useCallback(() => {
    clearTranscript()
    resetAllStores()
    setTranscriptState({ phase: 'onboarding' })
    setShowRestoredBanner(false)
    setImportError(null)
    setImportWarnings([])
    setShowWarningsBanner(false)
    setSizeWarning(null)
  }, [])

  // V4_GPU telemetry (exposed alongside CPU telemetry in HUD)
  const [gpuActive, setGpuActive] = useState(false)

  // V4 telemetry HUD polling (~2Hz)
  useEffect(() => {
    if (!showHud) return
    const id = setInterval(() => {
      const t = rendererRef.current?._lastTelemetry
      if (!t) return
      const mem = (performance as any).memory
      const heapMB = mem ? Math.round(mem.usedJSHeapSize / (1024 * 1024)) : 0
      setHudData({
        frameTimeP95: t.frameTimeP95,
        diffRate: t.diffRate,
        heapMB,
        eventThroughput: t.eventThroughput,
      })
      // V4_GPU: Check if GPU overlay is active
      setGpuActive(rendererRef.current?._lastGpuTelemetry?.active ?? false)
    }, 500)
    return () => clearInterval(id)
  }, [showHud])

  // Clean up worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  // Loading state
  if (transcriptState.phase === 'loading') {
    return (
      <div className="w-full h-full bg-gray-950 text-gray-400 flex items-center justify-center">
        <span className="font-pixel text-xs animate-pulse">Loading...</span>
      </div>
    )
  }

  // Onboarding: upload screen
  if (transcriptState.phase === 'onboarding') {
    return (
      <div className="w-full h-full relative">
        {/* Back button overlay */}
        <div className="absolute top-4 left-4 z-20">
          <button
            onClick={resetMode}
            className="text-gray-400 hover:text-white text-sm bg-gray-800/80 px-3 py-1.5 rounded border border-gray-700"
            title="Back to mode selection"
          >
            ← Back
          </button>
        </div>

        <TranscriptImportScreen
          onImport={handleImport}
          errorMessage={importError}
          warning={transcriptState.warning}
          progress={pipelineProgress ? {
            stage: STAGE_LABELS[pipelineProgress.stage],
            percent: pipelineProgress.percent,
          } : null}
          sizeWarning={sizeWarning}
          importWarnings={importWarnings}
        />

        {/* Pipeline progress overlay */}
        {pipelineProgress && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-950/70 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-80 shadow-2xl">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Processing</div>
              <div className="text-sm text-gray-200 mb-3">
                {STAGE_LABELS[pipelineProgress.stage]}
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300 ease-out"
                  style={{ width: `${pipelineProgress.percent}%` }}
                />
              </div>
              <div className="text-right text-[10px] text-gray-500 mt-1">
                {pipelineProgress.percent}%
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Playing: world canvas + transcript toolbar
  return (
    <div className="w-full h-full flex flex-col">
      {/* Import warnings banner (expandable + dismissible) */}
      {showWarningsBanner && importWarnings.length > 0 && (
        <WarningsBanner
          warnings={importWarnings}
          onDismiss={() => setShowWarningsBanner(false)}
        />
      )}

      {/* Restored banner */}
      {showRestoredBanner && transcriptState.restoredFromStorage && (
        <div className="bg-blue-900/60 border-b border-blue-700/50 px-4 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-blue-200">
            Loaded previously imported transcript for <strong className="text-blue-100">{transcriptState.projectName}</strong>
          </span>
          <button
            onClick={() => setShowRestoredBanner(false)}
            className="text-blue-400 hover:text-blue-200 text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Simulation size warning */}
      {simWarning && (
        <div className="bg-yellow-900/60 border-b border-yellow-700/50 px-4 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-yellow-200">{simWarning.message}</span>
          <div className="flex items-center gap-2">
            <button onClick={simWarning.onCancel} className="text-yellow-300 text-xs">Cancel</button>
            <button onClick={simWarning.onContinue} className="text-yellow-100 text-xs font-semibold">Continue</button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-3 shrink-0">
        {/* Back to mode selection */}
        <button
          onClick={resetMode}
          className="text-gray-400 hover:text-white text-sm mr-1"
          title="Back to mode selection"
        >
          ←
        </button>

        {/* Project name in Multiverse style */}
        <h1 className="font-pixel text-xs text-green-400 mr-2 truncate max-w-[260px]">
          {transcriptState.projectName}
        </h1>

        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={engine.restart}
            className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
            title="Restart"
          >
            ⏮
          </button>
          {engine.playbackState === 'playing' ? (
            <button
              onClick={engine.pause}
              className="text-xs px-2 py-1 bg-yellow-700 hover:bg-yellow-600 rounded"
            >
              ⏸
            </button>
          ) : (
            <button
              onClick={engine.play}
              disabled={engine.playbackState === 'complete'}
              className="text-xs px-2 py-1 bg-green-700 hover:bg-green-600 rounded disabled:opacity-50"
            >
              ▶️
            </button>
          )}
          <button
            onClick={engine.stepForward}
            disabled={engine.playbackState === 'complete'}
            className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
            title="Step Forward"
          >
            ⏭
          </button>
        </div>

        {/* Speed control */}
        <div className="flex items-center gap-1">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              onClick={() => engine.setSpeed(speed)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                engine.speed === speed
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${engine.progress * 100}%` }}
            />
          </div>
          <span className="font-mono text-[10px]">
            {engine.currentEventIndex}/{engine.totalEvents}
          </span>
        </div>

        <div className="flex-1" />

        {/* Replace / Clear actions — compact emoji buttons with hover titles */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReplace}
            title="Reupload transcript"
            aria-label="Reupload transcript"
            className="h-7 w-7 p-0 cursor-pointer text-sm"
          >
            🔁
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowClearConfirm(true)}
            title="Clear transcript"
            aria-label="Clear transcript"
            className="h-7 w-7 p-0 cursor-pointer text-sm"
          >
            🗑️
          </Button>
        </div>

        {/* Clear confirmation dialog */}
        <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
          <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-gray-100">Clear simulation?</DialogTitle>
              <DialogDescription className="text-gray-400">
                This will remove the current transcript and all generated data. You&apos;ll need to upload again to start a new simulation.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <DialogClose asChild>
                <Button variant="ghost" size="sm">Cancel</Button>
              </DialogClose>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setShowClearConfirm(false)
                  handleClear()
                }}
              >
                Clear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Zoom tier icon */}
        <span className="text-sm text-gray-400 cursor-default" title={`Zoom level: ${zoomTier.charAt(0).toUpperCase() + zoomTier.slice(1)}`}>
          {zoomTier === 'universe' || zoomTier === 'orbital' ? '🌍'
            : zoomTier === 'island' ? '🏝️'
            : zoomTier === 'district' ? '🏘️'
            : zoomTier === 'street' ? '🏠'
            : '🔍'}
        </span>
      </header>

      {/* Main canvas area */}
      <main className="flex-1 relative">
        <GameCanvas onRendererReady={(r) => { rendererRef.current = r; engine.setRenderer(r) }} />
        <EventLog />
        <FollowBadge />
        <AgentPanel />
        <BuildingPanel />
        <DistrictPanel />
        <MonsterPanel />

        {/* V4 Telemetry HUD (dev only — ?hud=1 or window.__MV_V4_HUD__) */}
        {showHud && hudData && (
          <div className="absolute bottom-2 left-2 z-50 bg-black/70 border border-gray-700 rounded px-2 py-1.5 font-mono text-[10px] text-gray-300 pointer-events-none select-none space-y-0.5">
            <div>p95 <span className={hudData.frameTimeP95 > 16 ? 'text-red-400' : 'text-green-400'}>{hudData.frameTimeP95.toFixed(1)}ms</span></div>
            <div>diffs <span className="text-blue-300">{hudData.diffRate}</span></div>
            {hudData.heapMB > 0 && <div>heap <span className={hudData.heapMB > 512 ? 'text-yellow-400' : 'text-gray-400'}>{hudData.heapMB}MB</span></div>}
            <div>evt/s <span className="text-gray-400">{hudData.eventThroughput}</span></div>
            <div>gpu <span className={gpuActive ? 'text-green-400' : 'text-gray-500'}>{gpuActive ? 'ON' : 'off'}</span></div>
          </div>
        )}
      </main>
    </div>
  )
}
