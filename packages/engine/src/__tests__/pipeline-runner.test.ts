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

  it('processes multi-file input (main + subagent transcripts)', async () => {
    const mainTs = '2026-01-01T00:00:00Z'
    const subTs  = '2026-01-01T00:00:02Z'

    const fileContents = [
      {
        name: 'main.jsonl',
        content: [
          JSON.stringify({
            type: 'user',
            ts: mainTs,
            content: [{ type: 'text', text: 'research this topic' }],
          }),
          JSON.stringify({
            type: 'assistant',
            ts: '2026-01-01T00:00:01Z',
            cwd: '/repo',
            gitBranch: 'main',
            content: [
              {
                type: 'tool_use',
                id: 'tu_main',
                name: 'Write',
                input: { file_path: '/repo/report.md', content: '# Report' },
              },
            ],
          }),
        ].join('\n'),
      },
      {
        name: 'agent-sub1.jsonl',
        content: [
          JSON.stringify({
            type: 'user',
            ts: subTs,
            content: [{ type: 'text', text: 'sub-task 1' }],
          }),
          JSON.stringify({
            type: 'assistant',
            ts: '2026-01-01T00:00:03Z',
            cwd: '/repo',
            gitBranch: 'main',
            content: [
              {
                type: 'tool_use',
                id: 'tu_sub1',
                name: 'Write',
                input: { file_path: '/repo/research/topic-a.md', content: '# Topic A' },
              },
            ],
          }),
        ].join('\n'),
      },
    ]

    const result = await runPipeline('multi-file-test', fileContents)

    expect(result.scenario).toBeDefined()
    expect(result.scenario.snapshot).toBeDefined()
    expect(result.scenario.events).toBeInstanceOf(Array)
    expect(result.scenario.events.length).toBeGreaterThan(0)

    // Both files should have contributed operations — at least 2 tool_use events
    const toolEvents = result.scenario.events.filter(
      (e) => e.type === 'tool_use' || e.type === 'file_create' || e.type === 'file_edit',
    )
    expect(toolEvents.length).toBeGreaterThanOrEqual(2)

    // Snapshot should have buildings corresponding to file paths from both files
    const buildings = result.scenario.snapshot.buildings ?? []
    expect(buildings.length).toBeGreaterThanOrEqual(1)
  })

  it('multi-file: resolveFixtureUrls helper returns correct URLs', async () => {
    // Import the loader to test the registry structure
    const { DEMO_SCENARIOS, DEMO_SCENARIO_NAMES } = await import(
      '../modes/demo/demoScenarioLoader'
    )

    expect(DEMO_SCENARIO_NAMES).toContain('team-build')
    expect(DEMO_SCENARIO_NAMES).toContain('refactor-rebuild')
    expect(DEMO_SCENARIO_NAMES).toHaveLength(2)

    // team-build uses fixtureFiles (multi-file)
    const teamBuild = DEMO_SCENARIOS['team-build']
    expect(teamBuild.fixtureFiles).toBeDefined()
    expect(teamBuild.fixtureFiles!.length).toBeGreaterThanOrEqual(2)
    expect(teamBuild.fixtureFiles![0]).toContain('main.jsonl')

    // refactor-rebuild uses fixtureFiles (single main)
    const refactorRebuild = DEMO_SCENARIOS['refactor-rebuild']
    expect(refactorRebuild.fixtureFiles).toBeDefined()
    expect(refactorRebuild.fixtureFiles!.length).toBe(1)
    expect(refactorRebuild.fixtureFiles![0]).toContain('main.jsonl')
  })
})
