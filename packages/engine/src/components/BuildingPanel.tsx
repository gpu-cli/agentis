// ============================================================================
// Building Inspection Panel — Side panel showing building details, directory,
// and list of files (tiles) that make up the building.
// ============================================================================

import { useUIStore } from '../stores/uiStore'
import { useUniverseStore } from '../stores/universeStore'
import {
  friendlyBuildingName,
  buildingFilePath,
  buildingSourceUrl,
} from '../utils/naming'
import { SpriteIcon } from './SpriteIcon'
import { ResizableSidePanel } from './ResizableSidePanel'
import { ScrollArea } from '@multiverse/ui'



const STATE_LABELS: Record<string, string> = {
  scaffolding: 'Scaffolding',
  building: 'Building',
  complete: 'Complete',
  ruins: 'Ruins',
}

const STATE_EMOJI: Record<string, string> = {
  scaffolding: '🏗️',
  building: '🔨',
  complete: '✅',
  ruins: '💀',
}

const COMPLETION_COLORS: Record<string, string> = {
  high: 'text-green-400',
  mid: 'text-yellow-400',
  low: 'text-red-400',
  none: 'text-gray-500',
}

function completionClass(health: number): string {
  if (health >= 80) return COMPLETION_COLORS.high!
  if (health >= 50) return COMPLETION_COLORS.mid!
  if (health > 0) return COMPLETION_COLORS.low!
  return COMPLETION_COLORS.none!
}

/** Derive the repo name from island external_ref, e.g. "acme/api" */
function getRepoName(buildingDistrictId: string): { name: string; url: string | null } | null {
  const districts = useUniverseStore.getState().districts
  const islands = useUniverseStore.getState().islands
  const district = districts.get(buildingDistrictId)
  if (!district) return null
  const island = islands.get(district.island_id)
  if (!island?.external_ref) return null

  const repoName = island.external_ref.source_id
  const url = island.external_ref.source === 'github'
    ? `https://github.com/${repoName}`
    : null

  return { name: repoName, url }
}

export function BuildingPanel() {
  const selectedId = useUIStore((s) => s.selectedEntityId)
  const selectedType = useUIStore((s) => s.selectedEntityType)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const buildings = useUniverseStore((s) => s.buildings)
  const tiles = useUniverseStore((s) => s.tiles)

  if (selectedType !== 'building' || !selectedId) return null

  const building = buildings.get(selectedId)
  if (!building) return null

  // Get all tiles belonging to this building
  const buildingTiles = Array.from(tiles.values()).filter(
    (t) => t.building_id === building.id,
  )

  const displayName = friendlyBuildingName(building.name)
  const filePath = buildingFilePath(building.external_ref, building.name)
  const sourceUrl = buildingSourceUrl(building.external_ref)
  const repo = getRepoName(building.district_id)

  const buildingSpriteKey = 'window_brick' // tile_0063

  return (
    <ResizableSidePanel>
      <div className="p-4 flex-1 min-h-0 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-pixel text-sm text-blue-400 truncate min-w-0">
            {displayName}
          </h2>
          <button
            onClick={clearSelection}
            className="text-gray-500 hover:text-white text-lg shrink-0 ml-2 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-700 transition-colors"
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>

        {/* Repo — first, above Path */}
        {repo && (
          <div className="mb-3">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Repository</span>
            {repo.url ? (
              <a
                href={repo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors mt-0.5"
              >
                <span>📦</span>
                <span className="hover:underline">{repo.name}</span>
                <span className="text-[10px] text-gray-500">↗</span>
              </a>
            ) : (
              <p className="text-sm text-gray-300 mt-0.5">{repo.name}</p>
            )}
          </div>
        )}

        {/* Path (was "Directory") */}
        <div className="mb-4">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Path</span>
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-blue-400 hover:text-blue-300 hover:underline font-mono bg-gray-900/80 rounded px-2.5 py-1.5 mt-1 transition-colors"
            >
              {filePath}
            </a>
          ) : (
            <p className="text-xs text-gray-300 font-mono bg-gray-900/80 rounded px-2.5 py-1.5 mt-1">
              {filePath}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700 mb-4" />

        {/* Stats — stacked vertically */}
        <div className="space-y-3 mb-4">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Complete</span>
            <div className="flex items-center gap-1.5 mt-1">
              <SpriteIcon region="flag" size={28} className="shrink-0" />
              <span className={`text-xs font-pixel leading-none ${completionClass(building.health)}`}>
                {building.health}%
              </span>
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Files</span>
            <div className="flex items-center gap-1.5 mt-1">
              <SpriteIcon region="lantern" size={28} className="shrink-0" />
              <span className="text-xs font-pixel text-gray-200 leading-none">
                {building.file_count}
              </span>
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Architecture</span>
            <div className="flex items-center gap-1.5 mt-1">
              <SpriteIcon region={buildingSpriteKey} size={28} className="shrink-0" />
              <span className="text-xs font-pixel text-gray-300 capitalize leading-none">
                {building.style.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700 mb-4" />

        {/* File list */}
        <div>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 block">
            Files ({buildingTiles.length})
          </span>
          {buildingTiles.length === 0 ? (
            <p className="text-xs text-gray-600 italic">
              No files discovered yet
            </p>
          ) : (
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-1">
                {buildingTiles.map((tile) => (
                  <div
                    key={tile.id}
                    className="flex items-center gap-2 text-xs bg-gray-700/50 rounded px-2.5 py-2"
                  >
                    <span className="text-gray-400 shrink-0 inline-flex items-center gap-1">
                      <span>{STATE_EMOJI[tile.state] ?? '❓'}</span>
                      {STATE_LABELS[tile.state] ?? tile.state}
                    </span>
                    <code className="bg-gray-600/50 px-1 rounded text-gray-200 truncate min-w-0">
                      {tile.file_name}
                    </code>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </ResizableSidePanel>
  )
}
