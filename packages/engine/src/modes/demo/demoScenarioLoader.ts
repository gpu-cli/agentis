// ============================================================================
// Demo Scenario Loader — pipeline-backed, replaces legacy mock scenarios
// Fetches JSONL transcript fixtures and runs them through the same
// ingest → canonicalize → world-model → layout → ScenarioData pipeline
// used by the transcript upload flow.
// ============================================================================

import { runPipeline } from '../transcript/worker/pipelineRunner'
import type { ScenarioData } from '@multiverse/shared'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DemoScenarioName =
  | 'single-island'
  | 'multi-district'
  | 'multi-island'
  | 'password-reset'
  | 'incident-bad-env'
  | 'research'

export interface DemoScenarioMeta {
  label: string
  description: string
  fixtureUrl: string
}

// ---------------------------------------------------------------------------
// Scenario registry
// ---------------------------------------------------------------------------

export const DEMO_SCENARIOS: Record<DemoScenarioName, DemoScenarioMeta> = {
  'single-island': {
    label: '🏝️ Health Check',
    description:
      'Small single-repo session: agent adds a health check endpoint, updates config, verifies tests, and commits.',
    fixtureUrl: '/demos/single-island.jsonl',
  },
  'multi-district': {
    label: '🔑 JWT Auth',
    description:
      'Agent implements JWT authentication across API routes, utilities, middleware, and test files in one repo.',
    fixtureUrl: '/demos/multi-district.jsonl',
  },
  'multi-island': {
    label: '📦 Shared Types',
    description:
      'Cross-package feature in a monorepo: shared types in core, server handlers, UI components, with full typecheck and build.',
    fixtureUrl: '/demos/multi-island.jsonl',
  },
  'password-reset': {
    label: '🔐 Password Reset',
    description:
      'Single agent implements password reset end-to-end: reads existing code, creates files, edits routes, runs tests.',
    fixtureUrl: '/demos/password-reset.jsonl',
  },
  'incident-bad-env': {
    label: '🚨 Incident: Bad Env',
    description:
      'Agent debugs a production incident caused by a bad environment variable — reads logs, searches config, fixes and redeploys.',
    fixtureUrl: '/demos/incident-bad-env.jsonl',
  },
  research: {
    label: '🔬 Research ADR',
    description:
      'Agent investigates API gateway patterns, writes an ADR, cross-links existing docs, and commits.',
    fixtureUrl: '/demos/research.jsonl',
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
 * Load a demo scenario by fetching its JSONL fixture and running it through
 * the full V3 ingest pipeline (same path as transcript upload).
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

  const promise = (async () => {
    onProgress?.('fetch', 5)
    const response = await fetch(meta.fixtureUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch demo fixture: ${meta.fixtureUrl} (${response.status})`)
    }
    const content = await response.text()

    onProgress?.('pipeline', 10)
    const result = await runPipeline(
      meta.label,
      [{ name: `${name}.jsonl`, content }],
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
