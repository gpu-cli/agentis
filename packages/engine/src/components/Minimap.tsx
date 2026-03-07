import { useRef, useEffect } from 'react'
import { useUniverseStore } from '../stores/universeStore'
import { useAgentStore } from '../stores/agentStore'

const MINIMAP_SIZE = 160
const TILE_SIZE = 32
const CHUNK_SIZE = 64

// Agent color mapping
const AGENT_COLORS: Record<string, string> = {
  engineer: '#4a90d9',
  devops: '#e67e22',
  researcher: '#1abc9c',
}

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const islands = useUniverseStore((s) => s.islands)
  const buildings = useUniverseStore((s) => s.buildings)
  const agents = useAgentStore((s) => s.agents)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Determine world bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const island of islands.values()) {
      const px = (island.position.chunk_x * CHUNK_SIZE + island.position.local_x) * TILE_SIZE
      const py = (island.position.chunk_y * CHUNK_SIZE + island.position.local_y) * TILE_SIZE
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px + island.bounds.width * TILE_SIZE)
      maxY = Math.max(maxY, py + island.bounds.height * TILE_SIZE)
    }

    if (minX === Infinity) return // No islands

    const worldW = maxX - minX || 1
    const worldH = maxY - minY || 1
    const scale = Math.min(MINIMAP_SIZE / worldW, MINIMAP_SIZE / worldH) * 0.8

    // Clear
    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE)
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE)

    const offsetX = (MINIMAP_SIZE - worldW * scale) / 2
    const offsetY = (MINIMAP_SIZE - worldH * scale) / 2

    // Draw buildings as small dots
    for (const building of buildings.values()) {
      const px = (building.position.chunk_x * CHUNK_SIZE + building.position.local_x) * TILE_SIZE
      const py = (building.position.chunk_y * CHUNK_SIZE + building.position.local_y) * TILE_SIZE
      const mx = (px - minX) * scale + offsetX
      const my = (py - minY) * scale + offsetY
      const mw = Math.max(2, building.footprint.width * TILE_SIZE * scale)
      const mh = Math.max(2, building.footprint.height * TILE_SIZE * scale)

      ctx.fillStyle = building.file_count > 0 ? '#27ae60' : '#555555'
      ctx.fillRect(mx, my, mw, mh)
    }

    // Draw agents as colored dots
    for (const agent of agents.values()) {
      const px = (agent.position.chunk_x * CHUNK_SIZE + agent.position.local_x) * TILE_SIZE
      const py = (agent.position.chunk_y * CHUNK_SIZE + agent.position.local_y) * TILE_SIZE
      const mx = (px - minX) * scale + offsetX
      const my = (py - minY) * scale + offsetY

      ctx.beginPath()
      ctx.arc(mx, my, 3, 0, Math.PI * 2)
      ctx.fillStyle = AGENT_COLORS[agent.type] ?? '#ffffff'
      ctx.fill()
    }

    // Border
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE)
  }, [islands, buildings, agents])

  return (
    <canvas
      ref={canvasRef}
      width={MINIMAP_SIZE}
      height={MINIMAP_SIZE}
      className="absolute bottom-4 right-4 border border-gray-700 rounded-lg opacity-80 hover:opacity-100 transition-opacity z-20"
    />
  )
}
