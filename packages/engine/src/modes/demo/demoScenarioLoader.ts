// ============================================================================
// Demo Scenario Loader — pipeline-backed, replaces legacy mock scenarios
// Fetches JSONL transcript fixtures and runs them through the same
// ingest → canonicalize → world-model → layout → ScenarioData pipeline
// used by the transcript upload flow.
//
// Supports both single-file (fixtureUrl) and multi-file (fixtureFiles)
// scenarios for transcripts with subagent JSONLs.
// ============================================================================

import { runPipeline } from '../transcript/worker/pipelineRunner'
import type { ScenarioData } from '@multiverse/shared'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DemoScenarioName =
  | 'team-build'
  | 'refactor-rebuild'

export interface DemoScenarioMeta {
  label: string
  description: string
  /** Single fixture URL (legacy — use fixtureFiles for multi-file scenarios) */
  fixtureUrl?: string
  /** Multiple fixture URLs — main transcript + subagent JSONLs */
  fixtureFiles?: string[]
}

// ---------------------------------------------------------------------------
// Scenario registry
// ---------------------------------------------------------------------------

export const DEMO_SCENARIOS: Record<DemoScenarioName, DemoScenarioMeta> = {
  'team-build': {
    label: '👥 Team Deep Research',
    description:
      'An orchestrator agent delegates deep research across six subagents working in parallel — each explores a different area, then the orchestrator synthesizes their findings into a unified report.',
    fixtureFiles: [
      '/demos/team-build/main.jsonl',
      '/demos/team-build/subagents/agent-a0c65f3460db719b0.jsonl',
      '/demos/team-build/subagents/agent-a3b3a17e4e2a29531.jsonl',
      '/demos/team-build/subagents/agent-a665aa7ee7908bf92.jsonl',
      '/demos/team-build/subagents/agent-ab7a230c4a5d88b67.jsonl',
      '/demos/team-build/subagents/agent-acbb85266c749a125.jsonl',
      '/demos/team-build/subagents/agent-adc13b2840de08519.jsonl',
    ],
  },
  'refactor-rebuild': {
    label: '🏗️ Build Task',
    description:
      'A single agent executes a build task — reading, editing, and creating files across the codebase to implement a feature end-to-end.',
    fixtureFiles: [
      '/demos/refactor-rebuild/main.jsonl',
    ],
  },
}

export const DEMO_SCENARIO_NAMES = Object.keys(DEMO_SCENARIOS) as DemoScenarioName[]

// ---------------------------------------------------------------------------
// In-memory cache — avoid re-running the pipeline for already-loaded scenarios
// ---------------------------------------------------------------------------

const scenarioCache = new Map<DemoScenarioName, ScenarioData>()
const inflightCache = new Map<DemoScenarioName, Promise<ScenarioData>>()

export function clearDemoCache(): void {
  scenarioCache.clear()
  inflightCache.clear()
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Resolve fixture URLs from a scenario meta.
 * Supports both legacy `fixtureUrl` (single file) and `fixtureFiles` (multi-file).
 */
function resolveFixtureUrls(meta: DemoScenarioMeta): string[] {
  if (meta.fixtureFiles && meta.fixtureFiles.length > 0) {
    return meta.fixtureFiles
  }
  if (meta.fixtureUrl) {
    return [meta.fixtureUrl]
  }
  return []
}

/**
 * Load a demo scenario by fetching its JSONL fixture(s) and running them
 * through the full V3 ingest pipeline (same path as transcript upload).
 *
 * Supports multi-file scenarios (main transcript + subagent JSONLs) by
 * fetching all fixture files and passing them as separate entries to
 * runPipeline.
 *
 * Results are cached in memory so switching between demos is instant after
 * the first load. Concurrent calls for the same scenario share one in-flight
 * Promise to avoid duplicate pipeline runs.
 */
export async function loadDemoScenario(
  name: DemoScenarioName,
  onProgress?: (stage: string, percent: number) => void,
): Promise<ScenarioData> {
  const cached = scenarioCache.get(name)
  if (cached) return cached

  // Deduplicate concurrent loads for the same scenario
  const inflight = inflightCache.get(name)
  if (inflight) return inflight

  const meta = DEMO_SCENARIOS[name]
  if (!meta) throw new Error(`Unknown demo scenario: ${name}`)

  const urls = resolveFixtureUrls(meta)
  if (urls.length === 0) {
    throw new Error(`Demo scenario ${name} has no fixture URLs configured`)
  }

  const promise = (async () => {
    onProgress?.('fetch', 5)

    // Fetch all fixture files in parallel
    const responses = await Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Failed to fetch demo fixture: ${url} (${response.status})`)
        }
        return { url, content: await response.text() }
      }),
    )

    // Build file contents array — extract filename from URL path
    const fileContents = responses.map(({ url, content }) => {
      const segments = url.split('/')
      const fileName = segments[segments.length - 1] ?? `${name}.jsonl`
      return { name: fileName, content }
    })

    onProgress?.('pipeline', 10)
    const result = await runPipeline(
      meta.label,
      fileContents,
      (progress) => {
        onProgress?.(progress.stage, progress.percent)
      },
    )

    if (result.warnings.length > 0) {
      console.warn(`[demo] ${name} pipeline warnings:`, result.warnings)
    }

    scenarioCache.set(name, result.scenario)
    return result.scenario
  })()

  inflightCache.set(name, promise)
  promise.finally(() => inflightCache.delete(name))

  return promise
}
