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
import { Button, ScrollArea } from '@multiverse/ui'



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
  none: 'text-muted-foreground',
}

type DistrictMap = ReturnType<typeof useUniverseStore.getState>['districts']
type IslandMap = ReturnType<typeof useUniverseStore.getState>['islands']

function completionClass(health: number): string {
  if (health >= 80) return COMPLETION_COLORS.high ?? 'text-green-400'
  if (health >= 50) return COMPLETION_COLORS.mid ?? 'text-yellow-400'
  if (health > 0) return COMPLETION_COLORS.low ?? 'text-red-400'
  return COMPLETION_COLORS.none ?? 'text-muted-foreground'
}

/** Derive the repo name from island external_ref, e.g. "acme/api" */
function getRepoName(
  buildingDistrictId: string,
  districts: DistrictMap,
  islands: IslandMap,
): { name: string; url: string | null } | null {
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
  const districts = useUniverseStore((s) => s.districts)
  const islands = useUniverseStore((s) => s.islands)
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
  const repo = getRepoName(building.district_id, districts, islands)

  const buildingSpriteKey = 'window_brick' // tile_0063

  return (
    <ResizableSidePanel>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-pixel text-sm text-blue-400 truncate min-w-0">
            {displayName}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearSelection}
            className="ml-2 h-7 w-7 shrink-0 text-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="Close panel"
          >
            ✕
          </Button>
        </div>

        {/* Repo — first, above Path */}
        {repo && (
          <div className="mb-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Repository</span>
            {repo.url ? (
              <a
                href={repo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors mt-0.5"
              >
                <span>📦</span>
                <span className="hover:underline">{repo.name}</span>
                <span className="text-[10px] text-muted-foreground">↗</span>
              </a>
            ) : (
              <p className="text-sm text-card-foreground mt-0.5">{repo.name}</p>
            )}
          </div>
        )}

        {/* Path (was "Directory") */}
        <div className="mb-4">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Path</span>
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-blue-400 hover:text-blue-300 hover:underline font-mono bg-card/80 rounded px-2.5 py-1.5 mt-1 transition-colors"
            >
              {filePath}
            </a>
          ) : (
            <p className="text-xs text-card-foreground font-mono bg-card/80 rounded px-2.5 py-1.5 mt-1">
              {filePath}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border mb-4" />

        {/* Stats — stacked vertically */}
        <div className="space-y-3 mb-4">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Complete</span>
            <div className="flex items-center gap-1.5 mt-1">
              <SpriteIcon region="flag" size={28} className="shrink-0" />
              <span className={`text-xs font-pixel leading-none ${completionClass(building.health)}`}>
                {building.health}%
              </span>
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Files</span>
            <div className="flex items-center gap-1.5 mt-1">
              <SpriteIcon region="lantern" size={28} className="shrink-0" />
              <span className="text-xs font-pixel text-card-foreground leading-none">
                {building.file_count}
              </span>
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Architecture</span>
            <div className="flex items-center gap-1.5 mt-1">
              <SpriteIcon region={buildingSpriteKey} size={28} className="shrink-0" />
              <span className="text-xs font-pixel text-card-foreground capitalize leading-none">
                {building.style.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border mb-4" />

        {/* File list */}
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">
            Files ({buildingTiles.length})
          </span>
          {buildingTiles.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">
              No files discovered yet
            </p>
          ) : (
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-1">
                {buildingTiles.map((tile) => (
                  <div
                    key={tile.id}
                    className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2.5 py-2"
                  >
                    <span className="text-muted-foreground shrink-0 inline-flex items-center gap-1">
                      <span>{STATE_EMOJI[tile.state] ?? '❓'}</span>
                      {STATE_LABELS[tile.state] ?? tile.state}
                    </span>
                    <code className="bg-muted/50 px-1 rounded text-card-foreground truncate min-w-0">
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
