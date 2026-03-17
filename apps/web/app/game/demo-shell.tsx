"use client";

import { GameCanvas } from "@multiverse/engine/components/GameCanvas";
import { useUIStore } from "@multiverse/engine/stores/uiStore";
import {
  DEMO_SCENARIOS,
  DEMO_SCENARIO_NAMES,
  type DemoScenarioName,
} from "@multiverse/engine/modes/demo/demoScenarioLoader";
import { useDemoLoader } from "@multiverse/engine/modes/demo/useDemoLoader";
import Link from "next/link";
import {
  DemoLoadingOverlay,
  DemoErrorBanner,
} from "@multiverse/engine/modes/demo/DemoOverlays";
import { ZoomTierIcon } from "@multiverse/engine/components/ZoomTierIcon";
import { PlaybackToolbar } from "@multiverse/engine/components/PlaybackToolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@multiverse/ui";

const speedOptions = [1, 2, 5, 10];

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
    <TooltipProvider delayDuration={300}>
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

        <header className="h-14 bg-surface-1 border-b border-border flex items-center px-4 gap-3 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/"
                className="font-pixel text-xs text-orange-400 hover:text-orange-300 transition-colors no-underline mr-2"
                aria-label="Back to home"
              >
                HOME
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">Back to home</TooltipContent>
          </Tooltip>

          <Select
            value={currentScenario}
            onValueChange={(value) => switchScenario(value as DemoScenarioName)}
            disabled={loadState.phase === "loading"}
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

          <ZoomTierIcon zoomTier={zoomTier} />
        </header>

        <main className="flex-1 min-h-0 relative overflow-hidden">
          <GameCanvas />
        </main>
      </div>
    </TooltipProvider>
  );
}
