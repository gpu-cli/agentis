import { Button, Tooltip, TooltipTrigger, TooltipContent } from '@multiverse/ui'

interface ZoomTierIconProps {
  zoomTier: string
}

function getZoomTierEmoji(zoomTier: string): string {
  if (zoomTier === 'universe' || zoomTier === 'orbital') return '🌍'
  if (zoomTier === 'island') return '🏝️'
  if (zoomTier === 'district') return '🏘️'
  if (zoomTier === 'street') return '🏠'
  return '🔍'
}

function getZoomTierLabel(zoomTier: string): string {
  return `Zoom level: ${zoomTier.charAt(0).toUpperCase() + zoomTier.slice(1)}`
}

export function ZoomTierIcon({ zoomTier }: ZoomTierIconProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-sm text-muted-foreground cursor-default"
          aria-label={getZoomTierLabel(zoomTier)}
        >
          {getZoomTierEmoji(zoomTier)}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">{getZoomTierLabel(zoomTier)}</TooltipContent>
    </Tooltip>
  )
}
