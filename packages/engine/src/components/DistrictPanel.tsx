// ============================================================================
// District Inspection Panel — Side panel showing district details,
// buildings within the district, and biome information.
// ============================================================================

import { useUIStore } from '../stores/uiStore'
import { useUniverseStore } from '../stores/universeStore'
import { friendlyBuildingName } from '../utils/naming'
import { SpriteIcon, BIOME_ICON_MAP } from './SpriteIcon'
import { ResizableSidePanel } from './ResizableSidePanel'
import { Button, ScrollArea } from '@multiverse/ui'

// Biome label now shown as sprite icon next to district name (BIOME_ICON_MAP)

function completionClass(pct: number): string {
  if (pct >= 80) return 'text-green-400'
  if (pct >= 50) return 'text-yellow-400'
  if (pct > 0) return 'text-red-400'
  return 'text-muted-foreground'
}

export function DistrictPanel() {
  const selectedId = useUIStore((s) => s.selectedEntityId)
  const selectedType = useUIStore((s) => s.selectedEntityType)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const districts = useUniverseStore((s) => s.districts)
  const buildings = useUniverseStore((s) => s.buildings)
  const islands = useUniverseStore((s) => s.islands)

  if (selectedType !== 'district' || !selectedId) return null

  const district = districts.get(selectedId)
  if (!district) return null

  const island = islands.get(district.island_id)
  const biomeKey = district.biome_override ?? island?.biome ?? 'urban'

  // Get all buildings in this district
  const districtBuildings = Array.from(buildings.values()).filter(
    (b) => b.district_id === district.id,
  )

  // Compute aggregate stats
  const totalFiles = districtBuildings.reduce((sum, b) => sum + b.file_count, 0)
  const avgCompletion =
    districtBuildings.length > 0
      ? Math.round(
          districtBuildings.reduce((sum, b) => sum + b.health, 0) /
            districtBuildings.length,
        )
      : 0

  return (
    <ResizableSidePanel>
      {/* Scrollable content */}
      <div className="p-4">
        {/* Header — biome icon + district name with hover tooltip */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2 min-w-0 flex-1" title={district.name}>
            <SpriteIcon region={BIOME_ICON_MAP[biomeKey] ?? 'wall_brick_tl'} size={24} className="shrink-0" />
            <h2 className="font-pixel text-sm text-purple-400 truncate min-w-0">
              {district.name}
            </h2>
          </div>
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

        {/* Island */}
        {island && (
          <div className="mb-4">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Island</span>
            <p className="text-xs font-pixel text-card-foreground mt-0.5">{island.name}</p>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-border mb-4" />

        {/* Stats row — third */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Buildings</span>
            <div className="flex items-center gap-1.5 mt-1">
              <SpriteIcon region="wall_grey_br" size={28} className="shrink-0" />
              <span className="text-xs font-pixel text-card-foreground leading-none">
                {districtBuildings.length}
              </span>
            </div>
          </div>
          <div className="flex-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Files</span>
            <div className="flex items-center gap-1.5 mt-1">
              <SpriteIcon region="lantern" size={28} className="shrink-0" />
              <span className="text-xs font-pixel text-card-foreground leading-none">{totalFiles}</span>
            </div>
          </div>
          <div className="flex-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Complete</span>
            <div className="flex items-center gap-1.5 mt-1">
              <SpriteIcon region="flag" size={28} className="shrink-0" />
              <span className={`text-xs font-pixel leading-none ${completionClass(avgCompletion)}`}>
                {avgCompletion}%
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border mb-4" />

        {/* Buildings list — fourth */}
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">
            Buildings ({districtBuildings.length})
          </span>
          {districtBuildings.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">
              No buildings yet
            </p>
          ) : (
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-1.5">
                {districtBuildings.map((bld) => {
                  const displayName = friendlyBuildingName(bld.name)
                  return (
                    <Button
                      variant="ghost"
                      size="sm"
                      key={bld.id}
                      onClick={() =>
                        useUIStore.getState().selectEntity(bld.id, 'building')
                      }
                      className="h-auto w-full justify-start gap-2 bg-muted/50 px-2.5 py-2 text-left text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-purple-500"
                    >
                      <span
                        className={`font-pixel shrink-0 ${completionClass(bld.health)}`}
                      >
                        {bld.health}%
                      </span>
                      <span className="text-card-foreground truncate flex-1 min-w-0">
                        {displayName}
                      </span>
                      <span className="text-muted-foreground text-[10px] capitalize shrink-0">
                        {bld.style.replace(/_/g, ' ')}
                      </span>
                    </Button>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </ResizableSidePanel>
  )
}
