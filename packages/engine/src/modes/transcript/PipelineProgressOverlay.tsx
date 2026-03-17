import type { PipelineProgress } from './worker/pipelineRunner'

interface PipelineProgressOverlayProps {
  progress: PipelineProgress
  stageLabel: string
}

export function PipelineProgressOverlay({ progress, stageLabel }: PipelineProgressOverlayProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <div className="w-80 rounded-lg border border-border bg-card p-6 shadow-2xl">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Processing</div>
        <div className="mb-3 text-sm text-card-foreground">{stageLabel}</div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-green-500 transition-all duration-300 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <div className="mt-1 text-right text-[10px] text-muted-foreground">{progress.percent}%</div>
      </div>
    </div>
  )
}
