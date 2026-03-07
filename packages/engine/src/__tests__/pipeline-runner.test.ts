// ============================================================================
// Pipeline Runner — unit tests (hq-5x6.4.6)
// Validates the portable runPipeline function with minimal transcript data.
// ============================================================================

import { describe, it, expect } from 'vitest'
import { runPipeline } from '../modes/transcript/worker/pipelineRunner'

describe('runPipeline', () => {
  it('processes a minimal transcript with tool_use records', async () => {
    const fileContents = [
      {
        name: 'session.jsonl',
        content: [
          JSON.stringify({
            type: 'user',
            ts: '2026-01-01T00:00:00Z',
            content: [{ type: 'text', text: 'hello' }],
          }),
          JSON.stringify({
            type: 'assistant',
            ts: '2026-01-01T00:00:01Z',
            cwd: '/repo',
            gitBranch: 'main',
            content: [
              {
                type: 'tool_use',
                id: 'tu1',
                name: 'Write',
                input: { file_path: '/repo/test.ts', content: 'test' },
              },
            ],
          }),
        ].join('\n'),
      },
    ]

    const progresses: Array<{ stage: string; percent: number }> = []
    const result = await runPipeline('test-project', fileContents, (p) =>
      progresses.push(p),
    )

    expect(result.scenario).toBeDefined()
    expect(result.scenario.name).toBeTruthy()
    expect(result.scenario.snapshot).toBeDefined()
    expect(result.scenario.events).toBeInstanceOf(Array)
    expect(result.warnings).toBeInstanceOf(Array)
    expect(result.projectedUncompressedSize).toBeGreaterThan(0)

    // Progress was reported
    expect(progresses.length).toBeGreaterThan(0)
    expect(progresses[progresses.length - 1]!.stage).toBe('complete')
    expect(progresses[progresses.length - 1]!.percent).toBe(100)
  })

  it('reports progress stages in order', async () => {
    const fileContents = [
      {
        name: 'session.jsonl',
        content: [
          JSON.stringify({
            type: 'user',
            ts: '2026-01-01T00:00:00Z',
            content: [{ type: 'text', text: 'hi' }],
          }),
          JSON.stringify({
            type: 'assistant',
            ts: '2026-01-01T00:00:01Z',
            cwd: '/repo',
            content: [
              {
                type: 'tool_use',
                name: 'Read',
                input: { file_path: '/repo/file.ts' },
              },
            ],
          }),
        ].join('\n'),
      },
    ]

    const stages: string[] = []
    await runPipeline('test', fileContents, (p) => stages.push(p.stage))

    expect(stages[0]).toBe('parse')
    expect(stages).toContain('canonicalize')
    expect(stages).toContain('model')
    expect(stages).toContain('layout')
    expect(stages[stages.length - 1]).toBe('complete')
  })

  it('throws on empty file list', async () => {
    await expect(runPipeline('test', [], undefined)).rejects.toThrow(
      'No files provided',
    )
  })

  it('throws when files contain no valid records', async () => {
    const fileContents = [
      {
        name: 'empty.jsonl',
        content: '{"not_a_type": true}',
      },
    ]

    await expect(runPipeline('test', fileContents, undefined)).rejects.toThrow(
      'No valid transcript records',
    )
  })

  it('works without an onProgress callback', async () => {
    const fileContents = [
      {
        name: 'session.jsonl',
        content: [
          JSON.stringify({
            type: 'user',
            ts: '2026-01-01T00:00:00Z',
            content: [{ type: 'text', text: 'hello' }],
          }),
          JSON.stringify({
            type: 'assistant',
            ts: '2026-01-01T00:00:01Z',
            cwd: '/repo',
            content: [
              {
                type: 'tool_use',
                name: 'Write',
                input: { file_path: '/repo/index.ts', content: 'code' },
              },
            ],
          }),
        ].join('\n'),
      },
    ]

    // Should not throw when onProgress is omitted
    const result = await runPipeline('test', fileContents)
    expect(result.scenario).toBeDefined()
  })
})
