import { useEffect, useState, type RefObject } from 'react'
import type { WorldRenderer } from '../../engine/WorldRenderer'

interface TranscriptHudProps {
  show: boolean
  rendererRef: RefObject<WorldRenderer | null>
}

interface HudData {
  frameTimeP95: number
  diffRate: number
  heapMB: number
  eventThroughput: number
  gpuActive: boolean
}

export function TranscriptHud({ show, rendererRef }: TranscriptHudProps) {
  const [hudData, setHudData] = useState<HudData | null>(null)

  useEffect(() => {
    if (!show) return
    const id = setInterval(() => {
      const telemetry = rendererRef.current?._lastTelemetry
      if (!telemetry) return
      const perfMemory =
        'memory' in performance
          ? (performance as Performance & { memory: { usedJSHeapSize: number } }).memory
          : null
      const heapMB = perfMemory ? Math.round(perfMemory.usedJSHeapSize / (1024 * 1024)) : 0
      setHudData({
        frameTimeP95: telemetry.frameTimeP95,
        diffRate: telemetry.diffRate,
        heapMB,
        eventThroughput: telemetry.eventThroughput,
        gpuActive: rendererRef.current?._lastGpuTelemetry?.active ?? false,
      })
    }, 500)
    return () => clearInterval(id)
  }, [show, rendererRef])

  if (!show || !hudData) return null

  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-50 select-none space-y-0.5 rounded border border-border bg-card/70 px-2 py-1.5 font-mono text-[10px] text-card-foreground">
      <div>
        p95{' '}
        <span className={hudData.frameTimeP95 > 16 ? 'text-red-400' : 'text-green-400'}>
          {hudData.frameTimeP95.toFixed(1)}ms
        </span>
      </div>
      <div>
        diffs <span className="text-blue-300">{hudData.diffRate}</span>
      </div>
      {hudData.heapMB > 0 && (
        <div>
          heap{' '}
          <span className={hudData.heapMB > 512 ? 'text-yellow-400' : 'text-muted-foreground'}>
            {hudData.heapMB}MB
          </span>
        </div>
      )}
      <div>
        evt/s <span className="text-muted-foreground">{hudData.eventThroughput}</span>
      </div>
      <div>
        gpu <span className={hudData.gpuActive ? 'text-green-400' : 'text-muted-foreground'}>{hudData.gpuActive ? 'ON' : 'off'}</span>
      </div>
    </div>
  )
}
