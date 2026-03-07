/// <reference lib="webworker" />
// ============================================================================
// Pipeline Web Worker — runs ingest + layout off the main thread
// Posts progress updates and the final result back to the main thread.
// ============================================================================

import { runPipeline } from './pipelineRunner'

const ctx = self as unknown as DedicatedWorkerGlobalScope

// Mirror worker console logs to main thread so they appear in page console
const originalConsole = { ...console }
;(['log','info','warn','error'] as const).forEach((level) => {
  const orig = (originalConsole as any)[level]
  ;(console as any)[level] = (...args: unknown[]) => {
    try {
      ctx.postMessage({ type: 'log', level, args: args.map(String) })
    } catch {}
    try { orig.apply(originalConsole, args) } catch {}
  }
})

ctx.addEventListener('error', (event) => {
  ctx.postMessage({ type: 'error', message: `Worker error: ${event.message}` })
})

ctx.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const msg = event.reason instanceof Error ? event.reason.message : String(event.reason)
  ctx.postMessage({ type: 'error', message: `Unhandled rejection: ${msg}` })
})

ctx.addEventListener('message', async (event: MessageEvent) => {
  const { type, projectName, fileContents } = event.data as {
    type: string
    projectName: string
    fileContents: Array<{ name: string; content: string }>
  }

  if (type !== 'start') return

  try {
    const result = await runPipeline(projectName, fileContents, (progress) => {
      ctx.postMessage({ type: 'progress', ...progress })
    })

    // Chunk very large event sets to reduce postMessage payload spikes
    const CHUNK_EVENT_THRESHOLD = 10000
    const CHUNK_SIZE = 2000

    if (result.scenario.events.length > CHUNK_EVENT_THRESHOLD) {
      // Send scenario without events first
      const scenarioLite = { ...result.scenario, events: [] }
      ctx.postMessage({
        type: 'scenario',
        scenario: scenarioLite,
        warnings: result.warnings,
        projectedUncompressedSize: result.projectedUncompressedSize,
      })

      // Stream events in chunks
      const total = result.scenario.events.length
      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = result.scenario.events.slice(i, i + CHUNK_SIZE)
        ctx.postMessage({ type: 'events_chunk', chunk })
      }

      // Signal completion
      ctx.postMessage({ type: 'complete' })
      return
    }

    // Default (small) payload path — single message with everything
    ctx.postMessage({
      type: 'complete',
      scenario: result.scenario,
      warnings: result.warnings,
      projectedUncompressedSize: result.projectedUncompressedSize,
    })
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Pipeline failed',
    })
  }
})
