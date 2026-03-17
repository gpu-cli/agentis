// ============================================================================
// Transcript Page — Upload Claude transcripts, generate + replay
// Uses browser ingest pipeline (no legacy useScenarioReplay hook)
// V3 pipeline runs via Web Worker when available, main-thread fallback otherwise
// ============================================================================

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { GameCanvas } from '../../components/GameCanvas'
import { AgentPanel } from '../../components/AgentPanel'
import { BuildingPanel } from '../../components/BuildingPanel'
import { DistrictPanel } from '../../components/DistrictPanel'
import { MonsterPanel } from '../../components/MonsterPanel'
import { FollowBadge } from '../../components/FollowBadge'
import { EventLog } from '../../components/EventLog'
import { useUIStore } from '../../stores/uiStore'
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@multiverse/ui'
import { useModeStore } from '../../app/modeStore'
import { useReplayEngine } from '../../replay/useReplayEngine'
import { TranscriptImportScreen } from './TranscriptImportScreen'
import type { PipelineProgress } from './worker/pipelineRunner'
import { WarningsBanner } from './WarningsBanner'
import { useTranscriptImport } from './useTranscriptImport'
import type { WorldRenderer } from '../../engine/WorldRenderer'
import { getSpeedOptions } from '../../utils/playback'
import { TranscriptToolbar } from './TranscriptToolbar'
import { PipelineProgressOverlay } from './PipelineProgressOverlay'
import { TranscriptHud } from './TranscriptHud'
import {
  initialTranscriptState,
  transcriptReducer,
} from './useTranscriptReducer'

/** Human-readable labels for pipeline stages */
const STAGE_LABELS: Record<PipelineProgress['stage'], string> = {
  parse: 'Parsing transcripts...',
  canonicalize: 'Canonicalizing operations...',
  model: 'Building work model...',
  layout: 'Solving layout...',
  complete: 'Complete',
}


export interface TranscriptPageProps {
  /** Whether local session discovery is enabled. Defaults to true. */
  isLocalEnabled?: boolean
  /** URL to navigate to for install instructions when local mode is unavailable */
  localInstallUrl?: string
}

export function TranscriptPage({ isLocalEnabled, localInstallUrl }: TranscriptPageProps = {}) {
  const zoomTier = useUIStore((s) => s.zoomTier)
  const resetMode = useModeStore((s) => s.resetMode)
  const engine = useReplayEngine()

  const speedOptions = useMemo(() => getSpeedOptions(engine.totalEvents), [engine.totalEvents])

  // Clamp speed to nearest available option when options change
  useEffect(() => {
    if (!speedOptions.includes(engine.speed)) {
      const nearest = speedOptions.reduce((prev, curr) =>
        Math.abs(curr - engine.speed) < Math.abs(prev - engine.speed) ? curr : prev
      )
      engine.setSpeed(nearest)
    }
  }, [speedOptions, engine.speed, engine.setSpeed])

  const [state, dispatch] = useReducer(transcriptReducer, initialTranscriptState)
  const {
    transcriptState,
    importError,
    pipelineProgress,
    importWarnings,
    showWarningsBanner,
    sizeWarning,
    simWarning,
    showClearConfirm,
  } = state
  const [showRestoredBanner, setShowRestoredBanner] = useState(false)
  const initialized = useRef(false)
  const rendererRef = useRef<WorldRenderer | null>(null)

  // V4 telemetry HUD — enabled via ?hud=1 query param or window.__MV_V4_HUD__
  const showHud = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('hud') === '1' || window.__MV_V4_HUD__ === true)
    : false
  // TODO: localStorage hydration disabled — layout differs on reload vs fresh import.
  // Re-enable once layout is deterministic across sessions.
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    dispatch({ type: 'setTranscriptState', payload: { phase: 'onboarding' } })
  }, [engine])

  // Dismiss restored banner after 6 seconds
  useEffect(() => {
    if (!showRestoredBanner) return
    const timer = setTimeout(() => setShowRestoredBanner(false), 6000)
    return () => clearTimeout(timer)
  }, [showRestoredBanner])

  const { handleImport, handleReplace, handleClear } = useTranscriptImport({
    engine,
    dispatch,
    setShowRestoredBanner,
  })

  // Loading state
  if (transcriptState.phase === 'loading') {
    return (
      <TooltipProvider delayDuration={300}>
        <div className="w-full h-full bg-background text-muted-foreground flex items-center justify-center">
          <span className="font-pixel text-xs animate-pulse">Loading...</span>
        </div>
      </TooltipProvider>
    )
  }

  // Onboarding: upload screen
  if (transcriptState.phase === 'onboarding') {
    return (
      <TooltipProvider delayDuration={300}>
        <div className="w-full h-full relative">
          {/* Back button overlay */}
          <div className="absolute top-4 left-4 z-20">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetMode}
                  className="bg-card/80 text-sm text-muted-foreground hover:text-accent-foreground"
                  aria-label="Back to mode selection"
                >
                  ← Back
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">Back to mode selection</TooltipContent>
            </Tooltip>
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
            isLocalEnabled={isLocalEnabled}
            localInstallUrl={localInstallUrl}
          />

          {/* Pipeline progress overlay */}
          {pipelineProgress && (
            <PipelineProgressOverlay
              progress={pipelineProgress}
              stageLabel={STAGE_LABELS[pipelineProgress.stage]}
            />
          )}
        </div>
      </TooltipProvider>
    )
  }

  // Playing: world canvas + transcript toolbar
  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-full h-full flex flex-col">
      {/* Import warnings banner (expandable + dismissible) */}
      {showWarningsBanner && importWarnings.length > 0 && (
        <WarningsBanner
          warnings={importWarnings}
          onDismiss={() => dispatch({ type: 'setShowWarningsBanner', payload: false })}
        />
      )}

      {/* Restored banner */}
      {showRestoredBanner && transcriptState.restoredFromStorage && (
        <div className="bg-blue-900/60 border-b border-blue-700/50 px-4 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-blue-200">
            Loaded previously imported transcript for <strong className="text-blue-100">{transcriptState.projectName}</strong>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRestoredBanner(false)}
            className="ml-4 h-6 px-2 text-xs text-blue-400 hover:text-blue-200"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Simulation size warning */}
      {simWarning && (
        <div className="bg-yellow-900/60 border-b border-yellow-700/50 px-4 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-yellow-200">{simWarning.message}</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={simWarning.onCancel} className="h-6 px-2 text-xs text-yellow-300">Cancel</Button>
            <Button variant="default" size="sm" onClick={simWarning.onContinue} className="h-6 bg-yellow-700 px-2 text-xs text-yellow-100 hover:bg-yellow-600">Continue</Button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <TranscriptToolbar
        projectName={transcriptState.projectName ?? ''}
        zoomTier={zoomTier}
        engine={engine}
        speedOptions={speedOptions}
        showClearConfirm={showClearConfirm}
        onSetShowClearConfirm={(open) => dispatch({ type: 'setShowClearConfirm', payload: open })}
        onResetMode={resetMode}
        onReplace={handleReplace}
        onClear={handleClear}
      />

      {/* Main canvas area */}
      <main className="flex-1 min-h-0 relative overflow-hidden">
        <GameCanvas onRendererReady={(r) => { rendererRef.current = r; engine.setRenderer(r) }} />
        <EventLog />
        <FollowBadge />
        <AgentPanel />
        <BuildingPanel />
        <DistrictPanel />
        <MonsterPanel />

        <TranscriptHud show={showHud} rendererRef={rendererRef} />
      </main>
      </div>
    </TooltipProvider>
  )
}
