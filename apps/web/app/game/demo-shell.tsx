"use client";

import { GameCanvas } from "@multiverse/engine/components/GameCanvas";
import { useUIStore } from "@multiverse/engine/stores/uiStore";
import {
  DEMO_SCENARIOS,
  DEMO_SCENARIO_NAMES,
  type DemoScenarioName,
} from "@multiverse/engine/modes/demo/demoScenarioLoader";
import { useDemoLoader } from "@multiverse/engine/modes/demo/useDemoLoader";
import {
  DemoLoadingOverlay,
  DemoErrorBanner,
} from "@multiverse/engine/modes/demo/DemoOverlays";

const SPEED_OPTIONS = [1, 2, 5, 10];

/**
 * Minimal demo shell — renders GameCanvas with playback controls.
 * This is a client-only component (loaded via dynamic import with ssr:false).
 * Uses pipeline-backed demo scenario loading (no legacy mock imports).
 */
export default function DemoShell() {
  const zoomTier = useUIStore((s) => s.zoomTier);
  const { engine, loadState, currentScenario, switchScenario, retry } =
    useDemoLoader();

  return (
    <div className="w-full h-full flex flex-col">
      {loadState.phase === "loading" && (
        <DemoLoadingOverlay
          stage={loadState.stage}
          percent={loadState.percent}
        />
      )}

      {loadState.phase === "error" && (
        <DemoErrorBanner message={loadState.message} onRetry={retry} />
      )}

      <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-3 shrink-0">
        <h1 className="font-pixel text-xs text-green-400 mr-2">Multiverse</h1>

        <select
          value={currentScenario}
          onChange={(e) =>
            switchScenario(e.target.value as DemoScenarioName)
          }
          disabled={loadState.phase === "loading"}
          className="bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded border border-gray-600 disabled:opacity-50"
        >
          {DEMO_SCENARIO_NAMES.map((name) => (
            <option key={name} value={name}>
              {DEMO_SCENARIOS[name].label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <button
            onClick={engine.restart}
            className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
            title="Restart"
          >
            ⏮
          </button>
          {engine.playbackState === "playing" ? (
            <button
              onClick={engine.pause}
              className="text-xs px-2 py-1 bg-yellow-700 hover:bg-yellow-600 rounded"
            >
              ⏸
            </button>
          ) : (
            <button
              onClick={engine.play}
              disabled={engine.playbackState === "complete"}
              className="text-xs px-2 py-1 bg-green-700 hover:bg-green-600 rounded disabled:opacity-50"
            >
              ▶️
            </button>
          )}
          <button
            onClick={engine.stepForward}
            disabled={engine.playbackState === "complete"}
            className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
            title="Step Forward"
          >
            ⏭
          </button>
        </div>

        <div className="flex items-center gap-1">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              onClick={() => engine.setSpeed(speed)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                engine.speed === speed
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-400 hover:bg-gray-600"
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

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

        <span className="text-xs text-gray-500 font-pixel">DEMO</span>

        <span
          className="text-sm text-gray-400 cursor-default"
          title={zoomTier.charAt(0).toUpperCase() + zoomTier.slice(1)}
        >
          {zoomTier === "universe" || zoomTier === "orbital"
            ? "🌍"
            : zoomTier === "island"
              ? "🏝️"
              : zoomTier === "district"
                ? "🏘️"
                : zoomTier === "street"
                  ? "🏠"
                  : "🔍"}
        </span>
      </header>

      <main className="flex-1 relative">
        <GameCanvas />
      </main>
    </div>
  );
}
