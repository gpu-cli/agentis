// ============================================================================
// Phase 2: Concrete Work Units + Scaling Policy
// ============================================================================

import type { CanonicalOperation, WorkUnit, SizeBand, MaterialState } from './types'

// ---------------------------------------------------------------------------
// Scaling policy
// ---------------------------------------------------------------------------

export function computeFilesPerTile(observedFileCount: number): number {
  if (observedFileCount > 10_000) return 10
  return 1
}

// ---------------------------------------------------------------------------
// Output-only scoring
// ---------------------------------------------------------------------------

export function computeOutputScore(stats: WorkUnit['stats']): number {
  return stats.editCount
}

export function deriveSizeBand(score: number): SizeBand {
  if (score < 3) return 'S'
  if (score < 8) return 'M'
  if (score < 20) return 'L'
  return 'XL'
}

// ---------------------------------------------------------------------------
// Size band → footprint dimensions (tile-grid units)
// ---------------------------------------------------------------------------

export function sizeBandFootprint(band: SizeBand): { width: number; height: number } {
  switch (band) {
    case 'S': return { width: 2, height: 2 }
    case 'M': return { width: 3, height: 2 }
    case 'L': return { width: 3, height: 3 }
    case 'XL': return { width: 4, height: 3 }
  }
}

// ---------------------------------------------------------------------------
// Build WorkUnits from CanonicalOperations
// ---------------------------------------------------------------------------

/** Simple deterministic hash for IDs */
function simpleHash(input: string): string {
  let h = 0x811c9dc5 // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) // FNV prime
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Normalize a file path: strip repo root, ensure forward slashes */
function normalizePath(path: string, repoRoot: string | null): string {
  let normalized = path.replace(/\\/gu, '/')
  if (repoRoot) {
    const root = repoRoot.replace(/\\/gu, '/')
    if (normalized.startsWith(root)) {
      normalized = normalized.slice(root.length)
    }
  }
  // Strip leading slash
  if (normalized.startsWith('/')) normalized = normalized.slice(1)
  return normalized
}

interface FileAccumulator {
  paths: Set<string>
  repoRoot: string
  branch: string | null
  materialState: MaterialState
  /** True when the last mutating operation is a file_delete with no subsequent create/write */
  deletedMarker: boolean
  /** Timestamp of the most recent file_delete (used for rename detection) */
  deleteTimestamp: number | null
  /** Actor ID of the most recent file_delete (used for rename detection) */
  deleteActorId: string | null
  stats: {
    opCount: number
    editCount: number
    readCount: number
    commandCount: number
    lastTouched: number
    actors: Set<string>
    errorCount: number
  }
}

export function buildWorkUnits(
  operations: CanonicalOperation[],
  filesPerTile: number,
  defaultRepoRoot: string,
): WorkUnit[] {
  // Step 1: Accumulate per-file stats
  const fileMap = new Map<string, FileAccumulator>()

  for (const op of operations) {
    if (!op.targetPath) continue

    const repoRoot = op.repoRoot ?? defaultRepoRoot
    const normalizedPath = normalizePath(op.targetPath, repoRoot)
    if (!normalizedPath) continue

    let acc = fileMap.get(normalizedPath)
    if (!acc) {
      acc = {
        paths: new Set([normalizedPath]),
        repoRoot,
        branch: op.branch,
        materialState: 'solid', // default, will be overridden by BranchTracker
        deletedMarker: false,
        deleteTimestamp: null,
        deleteActorId: null,
        stats: {
          opCount: 0,
          editCount: 0,
          readCount: 0,
          commandCount: 0,
          lastTouched: 0,
          actors: new Set(),
          errorCount: 0,
        },
      }
      fileMap.set(normalizedPath, acc)
    }

    acc.stats.opCount++
    acc.stats.actors.add(op.actor.id)
    acc.stats.lastTouched = Math.max(acc.stats.lastTouched, op.timestamp)

    // Update branch to latest
    if (op.branch) acc.branch = op.branch

    switch (op.kind) {
      case 'file_write':
      case 'file_create':
        acc.stats.editCount++
        acc.deletedMarker = false
        acc.deleteTimestamp = null
        acc.deleteActorId = null
        break
      case 'file_delete':
        acc.stats.editCount++
        acc.deletedMarker = true
        acc.deleteTimestamp = op.timestamp
        acc.deleteActorId = op.actor.id
        break
      case 'file_read':
        acc.stats.readCount++
        break
      case 'command_run':
        acc.stats.commandCount++
        break
    }
  }

  // Step 1.5: Detect rename patterns (delete + create within 5s, same actor, matching basename)
  const RENAME_WINDOW_MS = 5000
  const deletedPaths: Array<[string, FileAccumulator]> = []
  for (const [path, acc] of fileMap) {
    if (acc.deletedMarker && acc.deleteTimestamp !== null) {
      deletedPaths.push([path, acc])
    }
  }

  for (const [deletedPath, deletedAcc] of deletedPaths) {
    const deleteTs = deletedAcc.deleteTimestamp
    const deleteActor = deletedAcc.deleteActorId
    if (deleteTs === null || deleteActor === null) continue

    const deletedBasename = deletedPath.slice(deletedPath.lastIndexOf('/') + 1)

    for (const [createdPath, createdAcc] of fileMap) {
      if (createdPath === deletedPath) continue
      if (createdAcc.deletedMarker) continue

      const createdBasename = createdPath.slice(createdPath.lastIndexOf('/') + 1)
      if (createdBasename !== deletedBasename) continue

      // Same actor must appear on the created file
      if (!createdAcc.stats.actors.has(deleteActor)) continue

      // Created file's earliest activity must be within the rename window of the delete
      const timeDiff = Math.abs(createdAcc.stats.lastTouched - deleteTs)
      if (timeDiff > RENAME_WINDOW_MS) continue

      // Rename detected: merge deleted file's stats into created file
      createdAcc.stats.opCount += deletedAcc.stats.opCount
      createdAcc.stats.editCount += deletedAcc.stats.editCount
      createdAcc.stats.readCount += deletedAcc.stats.readCount
      createdAcc.stats.commandCount += deletedAcc.stats.commandCount
      createdAcc.stats.errorCount += deletedAcc.stats.errorCount
      for (const actor of deletedAcc.stats.actors) {
        createdAcc.stats.actors.add(actor)
      }
      createdAcc.stats.lastTouched = Math.max(createdAcc.stats.lastTouched, deletedAcc.stats.lastTouched)

      // Remove the deleted file from the map (merged into the created file)
      fileMap.delete(deletedPath)
      break
    }
  }

  // Step 2: Group by filesPerTile policy
  if (filesPerTile <= 1) {
    // 1:1 mapping
    return [...fileMap.entries()].map(([path, acc]) => {
      const stats = {
        ...acc.stats,
        actors: [...acc.stats.actors],
        deletedMarker: acc.deletedMarker,
      }
      const mass = computeOutputScore(stats)
      return {
        id: `wu_${simpleHash(path)}`,
        paths: [path],
        repoRoot: acc.repoRoot,
        districtId: '', // assigned during skeleton build
        mass,
        branch: acc.branch,
        materialState: acc.materialState,
        mergeEvidence: null,
        stats,
      }
    })
  }

  // Group files by parent directory, then bucket up to filesPerTile
  const dirBuckets = new Map<string, Array<[string, FileAccumulator]>>()
  for (const [path, acc] of fileMap) {
    const lastSlash = path.lastIndexOf('/')
    const dir = lastSlash > 0 ? path.slice(0, lastSlash) : '.'
    const bucket = dirBuckets.get(dir) ?? []
    bucket.push([path, acc])
    dirBuckets.set(dir, bucket)
  }

  const units: WorkUnit[] = []
  for (const [dir, entries] of dirBuckets) {
    for (let i = 0; i < entries.length; i += filesPerTile) {
      const group = entries.slice(i, i + filesPerTile)
      const paths = group.map(([p]) => p)
      const mergedStats = {
        opCount: 0,
        editCount: 0,
        readCount: 0,
        commandCount: 0,
        lastTouched: 0,
        actors: new Set<string>(),
        errorCount: 0,
      }
      let branch: string | null = null
      let repoRoot = defaultRepoRoot

      for (const [, acc] of group) {
        mergedStats.opCount += acc.stats.opCount
        mergedStats.editCount += acc.stats.editCount
        mergedStats.readCount += acc.stats.readCount
        mergedStats.commandCount += acc.stats.commandCount
        mergedStats.lastTouched = Math.max(mergedStats.lastTouched, acc.stats.lastTouched)
        mergedStats.errorCount += acc.stats.errorCount
        for (const a of acc.stats.actors) mergedStats.actors.add(a)
        if (acc.branch) branch = acc.branch
        repoRoot = acc.repoRoot
      }

      // deletedMarker is true only if ALL files in the group are deleted
      const groupDeletedMarker = group.every(([, a]) => a.deletedMarker)
      const finalStats = { ...mergedStats, actors: [...mergedStats.actors], deletedMarker: groupDeletedMarker }
      const mass = computeOutputScore(finalStats)

      units.push({
        id: `wu_${simpleHash(dir + ':' + i)}`,
        paths,
        repoRoot,
        districtId: '',
        mass,
        branch,
        materialState: 'solid',
        mergeEvidence: null,
        stats: finalStats,
      })
    }
  }

  return units
}
