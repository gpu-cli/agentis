import { useRef, useEffect, useState } from 'react'
import { WorldRenderer } from '../engine/WorldRenderer'
import { AssetLoader } from '../engine/AssetLoader'
import { useToolStore } from '../stores/toolStore'

interface GameCanvasProps {
  /** Called when the renderer is ready — used by V4 replay to wire diff consumer */
  onRendererReady?: (renderer: WorldRenderer) => void
}

export function GameCanvas({ onRendererReady }: GameCanvasProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<WorldRenderer | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadPhase, setLoadPhase] = useState('Initializing...')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let destroyed = false
    let pendingRenderer: WorldRenderer | null = null

    const setup = async () => {
      setLoadPhase('Preparing renderer...')
      useToolStore.getState().loadDefaults()

      if (destroyed) return

      setLoadPhase('Generating sprites...')

      // Track pending renderer so cleanup can destroy it even before init completes
      pendingRenderer = new WorldRenderer()
      try {
        await pendingRenderer.init(container)
      } catch {
        // Init failed (e.g. WebGL context lost) — silently degrade
        pendingRenderer = null
        return
      }

      // Check if component was unmounted during async init
      if (destroyed) {
        pendingRenderer?.destroy()
        pendingRenderer = null
        return
      }

      // Promote pending → active
      rendererRef.current = pendingRenderer
      onRendererReady?.(pendingRenderer)
      pendingRenderer = null

      const assets = AssetLoader.instance
      setLoadPhase(
        assets.usingRealAssets
          ? 'Assets loaded!'
          : 'Using placeholder sprites',
      )

      // Brief pause to show final phase message
      await new Promise((r) => setTimeout(r, 200))
      if (destroyed) return

      setLoading(false)
    }

    setup()

    // Handle resize
    const handleResize = () => {
      rendererRef.current?.resize()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      destroyed = true
      window.removeEventListener('resize', handleResize)
      // Destroy both active and any pending renderer
      try { rendererRef.current?.destroy() } catch { /* ignore destroy errors during cleanup */ }
      rendererRef.current = null
      try { pendingRenderer?.destroy() } catch { /* ignore destroy errors during cleanup */ }
      pendingRenderer = null
    }
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full bg-world-void relative cursor-grab">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <p className="font-pixel text-green-400 text-lg mb-4">Multiverse</p>
            <div className="w-48 h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${(AssetLoader.instance.loadProgress ?? 0) * 100}%` }}
              />
            </div>
            <p className="text-gray-500 text-xs">{loadPhase}</p>
          </div>
        </div>
      )}
    </div>
  )
}
