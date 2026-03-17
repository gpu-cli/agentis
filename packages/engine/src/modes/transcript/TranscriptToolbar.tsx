// ============================================================================
// TranscriptToolbar — Header bar for the transcript playing view
// ============================================================================

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@multiverse/ui'
import { PlaybackToolbar } from '../../components/PlaybackToolbar'
import { ZoomTierIcon } from '../../components/ZoomTierIcon'

interface TranscriptToolbarProps {
  projectName: string
  zoomTier: string
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
  }
  speedOptions: number[]
  showClearConfirm: boolean
  onSetShowClearConfirm: (open: boolean) => void
  onResetMode: () => void
  onReplace: () => void
  onClear: () => void
}

export function TranscriptToolbar({
  projectName,
  zoomTier,
  engine,
  speedOptions,
  showClearConfirm,
  onSetShowClearConfirm,
  onResetMode,
  onReplace,
  onClear,
}: TranscriptToolbarProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <header className="h-14 bg-surface-1 border-b border-border flex items-center px-4 gap-3 shrink-0">
        {/* Back to mode selection */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onResetMode}
              className="mr-1 h-7 w-7 text-sm text-muted-foreground hover:text-accent-foreground"
              aria-label="Back to mode selection"
            >
              ←
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">Back to mode selection</TooltipContent>
        </Tooltip>

        {/* Project name in Multiverse style */}
        <h1 className="font-pixel text-xs text-green-400 mr-2 truncate max-w-[260px]">
          {projectName}
        </h1>

        <PlaybackToolbar engine={engine} speedOptions={speedOptions} />

        <div className="flex-1" />

        {/* Replace / Clear actions */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onReplace}
                aria-label="Reupload transcript"
                className="h-7 w-7 p-0 cursor-pointer text-sm"
              >
                🔁
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reupload transcript</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSetShowClearConfirm(true)}
                aria-label="Clear transcript"
                className="h-7 w-7 p-0 cursor-pointer text-sm"
              >
                🗑️
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear transcript</TooltipContent>
          </Tooltip>
        </div>

        {/* Clear confirmation dialog */}
        <Dialog open={showClearConfirm} onOpenChange={onSetShowClearConfirm}>
          <DialogContent className="bg-card border-border text-card-foreground max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-card-foreground">Clear simulation?</DialogTitle>
              <DialogDescription className="text-muted-foreground">
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
                  onSetShowClearConfirm(false)
                  onClear()
                }}
              >
                Clear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Zoom tier icon */}
        <ZoomTierIcon zoomTier={zoomTier} />
      </header>
    </TooltipProvider>
  )
}
