// ============================================================================
// Pipeline Runner — ingest + world-model V3 pipeline as a portable function
// Can be called from main thread or inside a Web Worker.
// ============================================================================

import { parseUploadedFiles } from '@multiverse/ingest/browser'
import { canonicalize } from '@multiverse/ingest/browser'
import {
  buildWorkUnits,
  BranchTracker,
  buildWorldSkeleton,
  solveLayout,
  toScenarioData,
} from '@multiverse/world-model'
import type { WorldModelSnapshot } from '@multiverse/world-model'
import type { ScenarioData } from '@multiverse/shared'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStage = 'parse' | 'canonicalize' | 'model' | 'layout' | 'complete'

export interface PipelineProgress {
  stage: PipelineStage
  percent: number
}

export interface PipelineResult {
  scenario: ScenarioData
  warnings: string[]
  projectedUncompressedSize: number
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full V3 ingest-to-layout pipeline.
 *
 * 1. Parse uploaded file contents into sorted records
 * 2. Canonicalize records into a CanonicalWorkModel
 * 3. Build work units + branch tracking
 * 4. Build world skeleton + solve layout
 * 5. Convert to ScenarioData for the replay engine
 *
 * @param projectName   User-provided project label
 * @param fileContents  Pre-read file contents (worker-safe — no File objects)
 * @param onProgress    Optional callback for stage progress updates
 */
export async function runPipeline(
  projectName: string,
  fileContents: Array<{ name: string; content: string }>,
  onProgress?: (progress: PipelineProgress) => void,
): Promise<PipelineResult> {
  // Convert pre-read contents back to File objects for the parser
  const files = fileContents.map(({ name, content }) => new File([content], name))

  // Step 1: Parse
  onProgress?.({ stage: 'parse', percent: 20 })
  const { records, warnings: parseWarnings, projectedUncompressedBytes } =
    await parseUploadedFiles(files)
  const warnings = parseWarnings.map(
    (w) => `[parse] ${w.fileName}:${w.line}: ${w.message}`,
  )

  if (records.length === 0) {
    throw new Error(
      fileContents.length === 0
        ? 'No files provided'
        : 'No valid transcript records found in uploaded files',
    )
  }

  // Step 2: Canonicalize
  onProgress?.({ stage: 'canonicalize', percent: 40 })
  const cwm = canonicalize(projectName, records)
  const defaultRepoRoot = cwm.project.repos[0]?.root ?? ''

  // Diagnostics: ops per actor (top 5)
  try {
    const counts = new Map<string, number>()
    for (const op of cwm.operations) {
      counts.set(op.actor.id, (counts.get(op.actor.id) ?? 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    console.info('[pipeline] ops per actor (top5):', top.map(([id, n]) => `${id}:${n}`).join(', '))
  } catch {}

  // Step 3: Build work units + branch tracking
  onProgress?.({ stage: 'model', percent: 60 })
  const workUnits = buildWorkUnits(cwm.operations, cwm.filesPerTile, defaultRepoRoot)
  const tracker = new BranchTracker()
  tracker.detectMerges(cwm.operations)
  tracker.applyToWorkUnits(workUnits)

  // Step 4: Skeleton + layout
  onProgress?.({ stage: 'layout', percent: 80 })
  const skeleton = buildWorldSkeleton(cwm, workUnits)
  const solverIterations = solveLayout(skeleton.world)

  // Step 5: Build snapshot + convert to ScenarioData
  const snapshot: WorldModelSnapshot = {
    version: 1,
    generatedAt: Date.now(),
    world: skeleton.world,
    workUnits: skeleton.workUnits,
    actors: cwm.actors,
    layoutMeta: {
      seed: 0,
      filesPerTile: cwm.filesPerTile,
      totalObservedFiles: cwm.project.observedFileCount,
      solverIterations,
    },
    operations: cwm.operations,
  }

  const scenario = toScenarioData(snapshot)

  // Log pipeline stats for diagnostics
  const eventCount = scenario.events.length
  const actorCount = cwm.actors.length
  const opCount = cwm.operations.length
  console.info(
    `[pipeline] complete: ${opCount} operations → ${eventCount} events, ${actorCount} actors, ` +
    `${workUnits.length} work units, ${skeleton.world.islands.length} islands`,
  )
  if (eventCount > 3000) {
    console.warn(`[pipeline] high event count (${eventCount}) — may impact performance`)
  }

  onProgress?.({ stage: 'complete', percent: 100 })

  return {
    scenario,
    warnings,
    projectedUncompressedSize: projectedUncompressedBytes,
  }
}
