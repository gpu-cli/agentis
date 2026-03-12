import { useEffect, useRef, useState } from 'react'
import { loadDemoScenario } from '../modes/demo/demoScenarioLoader'
import type { PlanetSnapshot, ScenarioData } from '@multiverse/shared'

import { WorldRenderer } from '../engine/WorldRenderer'
import { useUniverseStore } from '../stores/universeStore'
import { useAgentStore } from '../stores/agentStore'
import { useMonsterStore } from '../stores/monsterStore'
import { useWorkItemStore } from '../stores/workItemStore'
import { useEventStore } from '../stores/eventStore'
import { useToolStore } from '../stores/toolStore'
import { useUIStore } from '../stores/uiStore'

export function OnboardingBackdrop() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let destroyed = false
    let renderer: WorldRenderer | null = null
    let pendingRenderer: WorldRenderer | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const loadSnapshotFromScenario = (previewSnapshot: PlanetSnapshot) => {
      if (destroyed) return
      useUniverseStore.getState().loadSnapshot(previewSnapshot)
      useAgentStore.getState().loadSnapshot(previewSnapshot)
      useMonsterStore.getState().loadSnapshot(previewSnapshot)
      useWorkItemStore.getState().loadSnapshot(previewSnapshot)
      useEventStore.getState().reset()
      useUIStore.getState().setFollowAgent(null)
    }

    const startEventLoop = (scenario: ScenarioData, previewSnapshot: PlanetSnapshot) => {
      let index = 0

      const tick = () => {
        if (destroyed) return

        if (index === 0) {
          loadSnapshotFromScenario(previewSnapshot)
        }

        if (destroyed) return

        const event = scenario.events[index]
        if (event) {
          useEventStore.getState().processEvent(event)
        }

        const current = scenario.events[index]
        index = (index + 1) % scenario.events.length
        const next = scenario.events[index]

        let delay = 900
        if (current && next) {
          delay = Math.max(250, Math.min(next.timestamp - current.timestamp, 1800))
        }
        if (index === 0) {
          delay = 1400
        }

        timer = setTimeout(tick, delay)
      }

      timer = setTimeout(tick, 650)
    }

    const setup = async () => {
      // Load scenario via pipeline (async)
      let scenario: ScenarioData
      try {
        scenario = await loadDemoScenario('team-build')
      } catch (err) {
        console.warn('[onboarding] failed to load backdrop scenario:', err)
        return
      }
      if (destroyed) return

      const previewSnapshot = buildTwoIslandPreviewSnapshot(scenario.snapshot)
      loadSnapshotFromScenario(previewSnapshot)
      if (destroyed) return
      useToolStore.getState().loadDefaults()

      // Track pending renderer so cleanup can destroy it even before init completes
      pendingRenderer = new WorldRenderer()
      try {
        await pendingRenderer.init(container)
      } catch {
        // Init failed (e.g. WebGL context lost) — silently degrade
        pendingRenderer = null
        return
      }

      if (destroyed || !pendingRenderer) {
        // Component unmounted during async init — cleanup already handled by effect teardown
        // (pendingRenderer may already be null if cleanup ran during the await)
        try { pendingRenderer?.destroy() } catch { /* ignore */ }
        pendingRenderer = null
        return
      }

      // Promote pending → active
      renderer = pendingRenderer
      pendingRenderer = null

      const viewport = renderer.camera?.viewport
      if (viewport && renderer.camera) {
        const center = viewport.center
        viewport.setZoom(0.55, true)
        renderer.camera.moveTo(center.x + 400, center.y + 20)
      }

      setReady(true)
      startEventLoop(scenario, previewSnapshot)
    }

    setup()

    return () => {
      destroyed = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      // Destroy both active and any pending renderer
      try { renderer?.destroy() } catch { /* ignore destroy errors during cleanup */ }
      renderer = null
      try { pendingRenderer?.destroy() } catch { /* ignore destroy errors during cleanup */ }
      pendingRenderer = null
    }
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div ref={containerRef} className="absolute inset-0 onboarding-world-preview" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_50%,rgba(2,6,23,0.72),rgba(2,6,23,0.22)_48%,rgba(2,6,23,0.78)_100%)]" />
      <div className="absolute inset-0 onboarding-grid-overlay opacity-20" />
      {!ready ? <div className="absolute inset-0 bg-slate-950/85" /> : null}
    </div>
  )
}

function buildTwoIslandPreviewSnapshot(snapshot: PlanetSnapshot): PlanetSnapshot {
  const primaryIsland = snapshot.islands[0]
  if (!primaryIsland) {
    return snapshot
  }

  const districtOffset = 90
  const secondIslandId = 'island_repo_docs'

  const secondaryIsland = {
    ...primaryIsland,
    id: secondIslandId,
    name: 'Docs Repository',
    position: {
      ...primaryIsland.position,
      local_x: primaryIsland.position.local_x + districtOffset,
      local_y: primaryIsland.position.local_y + 2,
    },
    biome: 'library',
  }

  const districts = [
    ...snapshot.districts,
    ...snapshot.districts.map((district, index) => ({
      ...district,
      id: `${district.id}_replica`,
      island_id: secondIslandId,
      name:
        index === 0 ? 'Writers' : index === 1 ? 'Knowledge Base' : 'References',
      position: {
        ...district.position,
        local_x: district.position.local_x + districtOffset,
        local_y: district.position.local_y + 2,
      },
      biome_override:
        index === 1 ? 'industrial' : index === 2 ? 'library' : district.biome_override,
    })),
  ]

  const buildings = [
    ...snapshot.buildings,
    ...snapshot.buildings.map((building) => ({
      ...building,
      id: `${building.id}_replica`,
      district_id: `${building.district_id}_replica`,
      position: {
        ...building.position,
        local_x: building.position.local_x + districtOffset,
        local_y: building.position.local_y + 2,
      },
      health: Math.max(35, building.health - 10),
    })),
  ]

  const tiles = [
    ...snapshot.tiles,
    ...snapshot.tiles.map((tile) => ({
      ...tile,
      id: `${tile.id}_replica`,
      building_id: `${tile.building_id}_replica`,
    })),
  ]

  const agents = snapshot.agents.map((agent, index) => {
    if (index === 1) {
      return {
        ...agent,
        position: {
          ...agent.position,
          local_x: agent.position.local_x + districtOffset,
          local_y: agent.position.local_y + 1,
        },
      }
    }
    return agent
  })

  return {
    ...snapshot,
    islands: [primaryIsland, secondaryIsland],
    districts,
    buildings,
    tiles,
    agents,
  }
}
