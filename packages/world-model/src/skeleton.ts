// ============================================================================
// Phase 4: World Skeleton Builder
// ============================================================================

import type {
  CanonicalWorkModel,
  WorkUnit,
  WMWorld,
  WMIsland,
  WMDistrict,
  WMBuilding,
  LayoutRect,
  MaterialState,
} from './types'
import { clusterDistricts } from './clustering'
import { deriveSizeBand, sizeBandFootprint } from './work-units'

/** Max work units (files) per building before splitting into sub-buildings.
 *  Set high enough that typical directories stay as one building. */
const MAX_FILES_PER_BUILDING = 80
const BIOMES = ['urban', 'library', 'industrial', 'observatory', 'arts', 'harbor', 'civic']

/** Simple deterministic hash */
function djb2(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

function deterministicId(prefix: string, input: string): string {
  return `${prefix}_${djb2(input).toString(16).padStart(8, '0')}`
}

const EMPTY_RECT: LayoutRect = { x: 0, y: 0, width: 0, height: 0 }

/**
 * Build a deterministic world hierarchy from canonical model + work units.
 * Layout rects are placeholders (0,0,0,0) — the layout solver fills them in.
 */
export function buildWorldSkeleton(
  model: CanonicalWorkModel,
  workUnits: WorkUnit[],
): { world: WMWorld; workUnits: WorkUnit[] } {
  // --- Step 1: World ---
  const world: WMWorld = {
    id: deterministicId('world', model.project.name),
    name: model.project.name,
    layout: { ...EMPTY_RECT },
    usedCapacity: 0,
    maxCapacity: 0,
    islands: [],
  }

  // --- Step 2: Islands (one per repo, or one default) ---
  const repos = model.project.repos.length > 0
    ? model.project.repos
    : [{ root: '', name: model.project.name, inferredFrom: 'user_provided' as const, branches: [] }]

  for (const repo of repos) {
    const biomeIndex = djb2(repo.name) % BIOMES.length
    const island: WMIsland = {
      id: deterministicId('island', repo.root || repo.name),
      name: repo.name,
      layout: { ...EMPTY_RECT },
      usedCapacity: 0,
      maxCapacity: 0,
      repoRoot: repo.root,
      biome: BIOMES[biomeIndex]!,
      districts: [],
    }

    // Filter work units for this repo
    const repoUnits = repo.root
      ? workUnits.filter(wu => wu.repoRoot === repo.root)
      : workUnits // if no root, all units belong here

    // --- Step 3: Districts from clustering ---
    const clusters = clusterDistricts(repoUnits)

    for (const cluster of clusters) {
      const districtId = deterministicId('dist', island.id + ':' + cluster.prefix)
      const district: WMDistrict = {
        id: districtId,
        name: cluster.name,
        layout: { ...EMPTY_RECT },
        usedCapacity: 0,
        maxCapacity: 0,
        islandId: island.id,
        pathPrefix: cluster.prefix,
        buildings: [],
      }

      // Assign district ID to work units
      for (const wuId of cluster.workUnitIds) {
        const wu = workUnits.find(w => w.id === wuId)
        if (wu) wu.districtId = districtId
      }

      // --- Step 4: Buildings from work units ---
      const districtUnits = cluster.workUnitIds
        .map(id => workUnits.find(w => w.id === id))
        .filter((wu): wu is WorkUnit => wu !== undefined)

      const buildingGroups = groupIntoBuildingBuckets(districtUnits, cluster.prefix)

      for (const group of buildingGroups) {
        const buildingName = group.name
        const totalMass = group.units.reduce((sum, wu) => sum + wu.mass, 0)
        const sizeBand = deriveSizeBand(totalMass)
        const footprint = sizeBandFootprint(sizeBand)

        // Aggregate material state: solid if ANY unit is solid
        const materialState: MaterialState = group.units.some(wu => wu.materialState === 'solid')
          ? 'solid'
          : 'ghost'

        const building: WMBuilding = {
          id: deterministicId('bldg', districtId + ':' + buildingName),
          name: buildingName,
          layout: { ...EMPTY_RECT, width: footprint.width, height: footprint.height },
          usedCapacity: totalMass,
          maxCapacity: footprint.width * footprint.height * 10,
          districtId,
          workUnitIds: group.units.map(wu => wu.id),
          sizeBand,
          materialState,
        }

        district.buildings.push(building)
        district.usedCapacity += totalMass
      }

      district.maxCapacity = Math.max(district.usedCapacity * 1.5, 100)
      island.districts.push(district)
      island.usedCapacity += district.usedCapacity
    }

    island.maxCapacity = Math.max(island.usedCapacity * 1.5, 500)
    world.islands.push(island)
    world.usedCapacity += island.usedCapacity
  }

  world.maxCapacity = Math.max(world.usedCapacity * 1.5, 1000)

  return { world, workUnits }
}

// ---------------------------------------------------------------------------
// Building grouping helpers
// ---------------------------------------------------------------------------

interface BuildingGroup {
  name: string
  units: WorkUnit[]
}

function groupIntoBuildingBuckets(units: WorkUnit[], districtPrefix: string): BuildingGroup[] {
  if (units.length === 0) return []

  // Group by immediate parent directory (relative to district prefix)
  const dirMap = new Map<string, WorkUnit[]>()

  for (const wu of units) {
    const primaryPath = wu.paths[0] ?? ''
    let relative = primaryPath
    if (districtPrefix && relative.startsWith(districtPrefix + '/')) {
      relative = relative.slice(districtPrefix.length + 1)
    } else if (districtPrefix && relative.startsWith(districtPrefix)) {
      relative = relative.slice(districtPrefix.length)
      if (relative.startsWith('/')) relative = relative.slice(1)
    }

    // Use first segment of relative path as group key.
    // Root-level files (no subdirectory) are grouped together under 'root'
    // instead of each file becoming its own building.
    const slashIndex = relative.indexOf('/')
    const groupKey = slashIndex > 0 ? relative.slice(0, slashIndex) : 'root'

    const group = dirMap.get(groupKey) ?? []
    group.push(wu)
    dirMap.set(groupKey, group)
  }

  // Convert to BuildingGroup array, splitting large groups
  const result: BuildingGroup[] = []

  for (const [name, groupUnits] of dirMap) {
    if (groupUnits.length <= MAX_FILES_PER_BUILDING) {
      result.push({ name: name || 'misc', units: groupUnits })
    } else {
      // Split into sub-buildings
      for (let i = 0; i < groupUnits.length; i += MAX_FILES_PER_BUILDING) {
        const slice = groupUnits.slice(i, i + MAX_FILES_PER_BUILDING)
        const suffix = i > 0 ? ` (${Math.floor(i / MAX_FILES_PER_BUILDING) + 1})` : ''
        result.push({ name: `${name || 'misc'}${suffix}`, units: slice })
      }
    }
  }

  // Sort by total mass descending for visual prominence
  result.sort((a, b) => {
    const massA = a.units.reduce((s, wu) => s + wu.mass, 0)
    const massB = b.units.reduce((s, wu) => s + wu.mass, 0)
    return massB - massA
  })

  return result
}
