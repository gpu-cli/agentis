// ============================================================================
// Phase 4: District Clustering
// ============================================================================

import type { WorkUnit } from './types'

export interface DistrictCluster {
  prefix: string
  name: string
  workUnitIds: string[]
  totalMass: number
}

const MAX_DISTRICTS = 12
const MIN_FILES_PER_DISTRICT = 3

/**
 * Cluster work units into districts by file path prefix.
 * Anti-fragmentation: merges tiny clusters, caps at MAX_DISTRICTS.
 */
export function clusterDistricts(workUnits: WorkUnit[]): DistrictCluster[] {
  if (workUnits.length === 0) {
    return [{ prefix: '', name: 'Workspace', workUnitIds: [], totalMass: 0 }]
  }

  // Step 1: Extract prefix for each work unit (first 2 path segments)
  const prefixMap = new Map<string, { ids: string[]; mass: number }>()

  for (const wu of workUnits) {
    const prefix = extractPrefix(wu.paths[0] ?? '', 2)
    const entry = prefixMap.get(prefix) ?? { ids: [], mass: 0 }
    entry.ids.push(wu.id)
    entry.mass += wu.mass
    prefixMap.set(prefix, entry)
  }

  // Step 2: Merge tiny clusters into nearest parent
  let clusters = [...prefixMap.entries()].map(([prefix, data]) => ({
    prefix,
    name: prefix || 'Workspace',
    workUnitIds: data.ids,
    totalMass: data.mass,
  }))

  // Sort by file count descending for stable merging
  clusters.sort((a, b) => b.workUnitIds.length - a.workUnitIds.length)

  // Merge tiny clusters
  let changed = true
  while (changed) {
    changed = false
    const tiny = clusters.filter(c => c.workUnitIds.length < MIN_FILES_PER_DISTRICT)
    if (tiny.length === 0 || clusters.length <= 1) break

    for (const small of tiny) {
      if (clusters.length <= 1) break

      // Find nearest parent (shorter prefix) or largest sibling
      const parentPrefix = extractPrefix(small.prefix, 1)
      let target = clusters.find(c => c !== small && c.prefix === parentPrefix)
      if (!target) {
        // Find largest sibling
        target = clusters.find(c => c !== small && c.workUnitIds.length >= MIN_FILES_PER_DISTRICT)
      }
      if (!target) {
        // Merge into the largest cluster
        target = clusters.find(c => c !== small)
      }
      if (target) {
        target.workUnitIds.push(...small.workUnitIds)
        target.totalMass += small.totalMass
        clusters = clusters.filter(c => c !== small)
        changed = true
        break // restart loop after modification
      }
    }
  }

  // Step 3: Cap at MAX_DISTRICTS by merging smallest
  while (clusters.length > MAX_DISTRICTS) {
    clusters.sort((a, b) => a.workUnitIds.length - b.workUnitIds.length)
    const smallest = clusters.shift()!
    const secondSmallest = clusters[0]!
    secondSmallest.workUnitIds.push(...smallest.workUnitIds)
    secondSmallest.totalMass += smallest.totalMass
  }

  // Sort final result by name for determinism
  clusters.sort((a, b) => a.name.localeCompare(b.name))

  return clusters
}

/** Extract first N segments of a file path */
function extractPrefix(path: string, segments: number): string {
  const parts = path.split('/').filter(p => p.length > 0)
  if (parts.length <= segments) {
    // If path has fewer segments than requested, use all but the last (filename)
    return parts.length > 1 ? parts.slice(0, -1).join('/') : parts[0] ?? ''
  }
  return parts.slice(0, segments).join('/')
}
