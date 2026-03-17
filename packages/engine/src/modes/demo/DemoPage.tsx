// ============================================================================
// Demo Page — pipeline-backed demo scenarios (no legacy mock imports)
// Loads JSONL transcript fixtures through the same ingest pipeline as
// the transcript upload flow.
// ============================================================================

import { GameCanvas } from '../../components/GameCanvas'
import { AgentPanel } from '../../components/AgentPanel'
import { BuildingPanel } from '../../components/BuildingPanel'
import { DistrictPanel } from '../../components/DistrictPanel'
import { MonsterPanel } from '../../components/MonsterPanel'
import { FollowBadge } from '../../components/FollowBadge'
import { EventLog } from '../../components/EventLog'
import { useUIStore } from '../../stores/uiStore'
import { useModeStore } from '../../app/modeStore'
import {
  DEMO_SCENARIOS,
  DEMO_SCENARIO_NAMES,
  type DemoScenarioName,
} from './demoScenarioLoader'
import { useDemoLoader } from './useDemoLoader'
import { DemoLoadingOverlay, DemoErrorBanner } from './DemoOverlays'
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@multiverse/ui'
import { useMemo, useEffect } from 'react'
import { getSpeedOptions } from '../../utils/playback'
import { ZoomTierIcon } from '../../components/ZoomTierIcon'
import { PlaybackToolbar } from '../../components/PlaybackToolbar'

export function DemoPage() {
  const zoomTier = useUIStore((s) => s.zoomTier)
  const resetMode = useModeStore((s) => s.resetMode)
  const { engine, loadState, currentScenario, switchScenario, retry } = useDemoLoader()

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

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-full h-full flex flex-col">
      {loadState.phase === 'loading' && (
        <DemoLoadingOverlay stage={loadState.stage} percent={loadState.percent} />
      )}

      {loadState.phase === 'error' && (
        <DemoErrorBanner message={loadState.message} onRetry={retry} />
      )}

      {/* Toolbar */}
      <header className="h-14 bg-surface-1 border-b border-border flex items-center px-4 gap-3 shrink-0">
        {/* Home — back to mode selection */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={resetMode}
              variant="nav"
              size="sm"
              className="mr-2 px-0"
              aria-label="Back to home"
            >
              HOME
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">Back to home</TooltipContent>
        </Tooltip>

        {/* Scenario picker */}
        <Select
          value={currentScenario}
          onValueChange={(value) => switchScenario(value as DemoScenarioName)}
          disabled={loadState.phase === 'loading'}
        >
          <SelectTrigger
            size="sm"
            className="w-52 bg-muted border-input text-card-foreground text-xs disabled:opacity-50"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {DEMO_SCENARIO_NAMES.map((name) => (
              <SelectItem
                key={name}
                value={name}
                className="text-card-foreground text-xs focus:bg-accent focus:text-accent-foreground"
              >
                {DEMO_SCENARIOS[name].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <PlaybackToolbar engine={engine} speedOptions={speedOptions} />

        <div className="flex-1" />

        {/* Zoom tier icon */}
        <ZoomTierIcon zoomTier={zoomTier} />
      </header>

      {/* Main canvas area */}
      <main className="flex-1 min-h-0 relative overflow-hidden">
        <GameCanvas />
        <EventLog />
        <FollowBadge />
        <AgentPanel />
        <BuildingPanel />
        <DistrictPanel />
        <MonsterPanel />
      </main>
      </div>
    </TooltipProvider>
  )
}
