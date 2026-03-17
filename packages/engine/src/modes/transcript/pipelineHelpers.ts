// ============================================================================
// Pipeline helpers — Worker construction, file reading, worker communication
// ============================================================================

import type { PipelineProgress } from './worker/pipelineRunner'

/**
 * Read File[] to plain objects that can be transferred to a Web Worker.
 * Workers cannot receive File objects, so we pre-read the text content.
 */
export async function readFilesToContents(
  files: File[],
): Promise<Array<{ name: string; content: string }>> {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      content: await file.text(),
    })),
  )
}

/**
 * Try to construct a Web Worker for the pipeline.
 * Returns null if Workers are unsupported or construction fails.
 */
export function tryCreatePipelineWorker(): Worker | null {
  try {
    if (typeof Worker === 'undefined') return null
    return new Worker(
      new URL('./worker/pipeline.worker.ts', import.meta.url),
      { type: 'module' },
    )
  } catch {
    return null
  }
}

/**
 * Execute the pipeline inside a Web Worker, returning a promise.
 * The worker is terminated on completion or error.
 */
export function runPipelineViaWorker(
  worker: Worker,
  projectName: string,
  fileContents: Array<{ name: string; content: string }>,
  onProgress: (progress: PipelineProgress) => void,
): Promise<import('./worker/pipelineRunner').PipelineResult> {
  return new Promise((resolve, reject) => {
    // Accumulators for chunked mode
    let scenarioBase: import('@multiverse/shared').ScenarioData | null = null
    const eventChunks: import('@multiverse/shared').AgentEvent[] = []
    let warnings: string[] = []
    let projectedUncompressedSize = 0

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as { type: string; [key: string]: unknown }
      switch (msg.type) {
        case 'log': {
          const level = (msg.level as 'log' | 'info' | 'warn' | 'error') ?? 'log'
          const args = (msg.args as unknown[]) ?? []
          // Mirror worker logs to main-thread console
          const logFn = console[level as keyof Console]
          if (typeof logFn === 'function') {
            ;(logFn as (...args: unknown[]) => void)(...args)
          }
          break
        }
        case 'progress':
          onProgress({
            stage: msg.stage as PipelineProgress['stage'],
            percent: msg.percent as number,
          })
          break
        case 'scenario':
          scenarioBase = msg.scenario as import('@multiverse/shared').ScenarioData
          warnings = msg.warnings as string[]
          projectedUncompressedSize = msg.projectedUncompressedSize as number
          break
        case 'events_chunk':
          eventChunks.push(...(msg.chunk as import('@multiverse/shared').AgentEvent[]))
          break
        case 'complete': {
          worker.terminate()
          // If we received a scenario base and chunks, assemble result
          if (scenarioBase) {
            resolve({
              scenario: { ...scenarioBase, events: eventChunks },
              warnings,
              projectedUncompressedSize,
            })
            break
          }
          // Back-compat path: complete carries everything
          resolve({
            scenario: msg.scenario as import('@multiverse/shared').ScenarioData,
            warnings: (msg.warnings as string[]) ?? [],
            projectedUncompressedSize: (msg.projectedUncompressedSize as number) ?? 0,
          })
          break
        }
        case 'error':
          worker.terminate()
          reject(new Error(msg.message as string))
          break
      }
    }
    worker.onerror = (err) => {
      worker.terminate()
      reject(new Error(err.message ?? 'Worker failed'))
    }
    worker.postMessage({ type: 'start', projectName, fileContents })
  })
}
