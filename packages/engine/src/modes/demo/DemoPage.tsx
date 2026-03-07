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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@multiverse/ui'

const SPEED_OPTIONS = [1, 2, 5, 10]

export function DemoPage() {
  const zoomTier = useUIStore((s) => s.zoomTier)
  const resetMode = useModeStore((s) => s.resetMode)
  const { engine, loadState, currentScenario, switchScenario, retry } = useDemoLoader()

  return (
    <div className="w-full h-full flex flex-col">
      {loadState.phase === 'loading' && (
        <DemoLoadingOverlay stage={loadState.stage} percent={loadState.percent} />
      )}

      {loadState.phase === 'error' && (
        <DemoErrorBanner message={loadState.message} onRetry={retry} />
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

        <h1 className="font-pixel text-xs text-green-400 mr-2">Multiverse</h1>

        {/* Scenario picker */}
        <Select
          value={currentScenario}
          onValueChange={(value) => switchScenario(value as DemoScenarioName)}
          disabled={loadState.phase === 'loading'}
        >
          <SelectTrigger
            size="sm"
            className="w-52 bg-gray-700 border-gray-600 text-gray-200 text-xs disabled:opacity-50"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-600">
            {DEMO_SCENARIO_NAMES.map((name) => (
              <SelectItem
                key={name}
                value={name}
                className="text-gray-200 text-xs focus:bg-gray-700 focus:text-white"
              >
                {DEMO_SCENARIOS[name].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

        <span className="text-xs text-orange-400 font-pixel">DEMO</span>

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
        <GameCanvas />
        <EventLog />
        <FollowBadge />
        <AgentPanel />
        <BuildingPanel />
        <DistrictPanel />
        <MonsterPanel />
      </main>
    </div>
  )
}
