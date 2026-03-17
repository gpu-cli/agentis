import { Button, Tooltip, TooltipTrigger, TooltipContent } from '@multiverse/ui'

interface PlaybackToolbarProps {
  /** Replay engine interface */
  engine: {
    playbackState: 'idle' | 'playing' | 'paused' | 'complete'
    speed: number
    progress: number
    currentEventIndex: number
    totalEvents: number
    restart: () => void
    play: () => void
    pause: () => void
    setSpeed: (speed: number) => void
    stepForward?: () => void
  }
  /** Speed multiplier options to show */
  speedOptions: number[]
}

export function PlaybackToolbar({ engine, speedOptions }: PlaybackToolbarProps) {
  return (
    <>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={engine.restart}
              className="h-6 px-1.5 text-[10px] border border-secondary/40 bg-secondary text-secondary-foreground hover:bg-secondary/80"
              aria-label="Restart"
            >
              🔄
            </Button>
          </TooltipTrigger>
          <TooltipContent>Restart</TooltipContent>
        </Tooltip>
        {engine.playbackState === 'playing' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                onClick={engine.pause}
                className="h-6 px-1.5 text-[10px]"
                aria-label="Pause"
              >
                ⏸
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pause</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                onClick={engine.play}
                disabled={engine.playbackState === 'complete'}
                className="h-6 px-1.5 text-[10px] disabled:opacity-50"
                aria-label="Play"
              >
                ▶️
              </Button>
            </TooltipTrigger>
            <TooltipContent>Play</TooltipContent>
          </Tooltip>
        )}
        {speedOptions.map((speed) => (
          <Tooltip key={speed}>
            <TooltipTrigger asChild>
              <Button
                variant="toolbar"
                size="sm"
                onClick={() => engine.setSpeed(speed)}
                className={`h-6 px-1.5 text-[10px] ${
                  engine.speed === speed
                    ? 'bg-accent text-accent-foreground'
                    : ''
                }`}
                aria-label={`Speed ${speed}x`}
              >
                {speed}x
              </Button>
            </TooltipTrigger>
            <TooltipContent>{speed}x speed</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${engine.progress * 100}%` }}
          />
        </div>
        <span className="font-mono text-[10px]">
          {engine.currentEventIndex}/{engine.totalEvents}
        </span>
      </div>
    </>
  )
}
