// ============================================================================
// Performance Harness — Synthetic datasets + benchmarks (hq-gij.5)
// ============================================================================

import { describe, it, expect } from 'vitest'
import { parseUploadedFiles } from '../browser/parser'
import { canonicalize } from '../browser/canonicalizer'
import { buildWorkUnits } from '@multiverse/world-model'
import { buildWorldSkeleton, solveLayout, validateLayoutInvariants } from '@multiverse/world-model'
import { generateLargeRecordSet } from './fixtures/sample-records'

// ---------------------------------------------------------------------------
// Synthetic dataset generator
// ---------------------------------------------------------------------------

describe('synthetic dataset generator', () => {
  it('generates correct number of records', () => {
    const content = generateLargeRecordSet(100)
    const lines = content.split('\n').filter(l => l.trim())
    expect(lines.length).toBe(100)
  })

  it('all generated lines are valid JSONL', () => {
    const content = generateLargeRecordSet(50)
    const lines = content.split('\n').filter(l => l.trim())
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
  })
})

// ---------------------------------------------------------------------------
// Parse performance
// ---------------------------------------------------------------------------

describe('parse performance', () => {
  it('parses 1k records under 2s', async () => {
    const content = generateLargeRecordSet(1_000)
    const file = new File([content], 'large.jsonl')

    const start = performance.now()
    const result = await parseUploadedFiles([file])
    const elapsed = performance.now() - start

    expect(result.records.length).toBe(1_000)
    expect(elapsed).toBeLessThan(2_000)
  })

  it('parses 5k records under 5s', async () => {
    const content = generateLargeRecordSet(5_000)
    const file = new File([content], 'large.jsonl')

    const start = performance.now()
    const result = await parseUploadedFiles([file])
    const elapsed = performance.now() - start

    expect(result.records.length).toBe(5_000)
    expect(elapsed).toBeLessThan(5_000)
  })
})

// ---------------------------------------------------------------------------
// Canonicalizer performance
// ---------------------------------------------------------------------------

describe('canonicalizer performance', () => {
  it('canonicalizes 1k records under 1s', async () => {
    const content = generateLargeRecordSet(1_000)
    const file = new File([content], 'large.jsonl')
    const parseResult = await parseUploadedFiles([file])

    const start = performance.now()
    const model = canonicalize('perf-test', parseResult.records)
    const elapsed = performance.now() - start

    expect(model.operations.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(1_000)
  })
})

// ---------------------------------------------------------------------------
// Layout performance
// ---------------------------------------------------------------------------

describe('layout performance', () => {
  it('builds skeleton + layout for 500 work units under 2s', async () => {
    const content = generateLargeRecordSet(2_000)
    const file = new File([content], 'large.jsonl')
    const parseResult = await parseUploadedFiles([file])
    const model = canonicalize('perf-test', parseResult.records)

    const start = performance.now()
    const workUnits = buildWorkUnits(model.operations, model.filesPerTile, model.project.repos[0]?.root ?? '')
    const { world } = buildWorldSkeleton(model, workUnits)
    solveLayout(world)
    const elapsed = performance.now() - start

    expect(workUnits.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(2_000)

    // Verify layout is valid
    const violations = validateLayoutInvariants(world)
    expect(violations).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// End-to-end pipeline performance
// ---------------------------------------------------------------------------

describe('end-to-end pipeline performance', () => {
  it('full pipeline (parse → canonicalize → layout) for 1k events under 5s', async () => {
    const content = generateLargeRecordSet(1_000)
    const file = new File([content], 'e2e.jsonl')

    const start = performance.now()

    // Parse
    const parseResult = await parseUploadedFiles([file])

    // Canonicalize
    const model = canonicalize('e2e-test', parseResult.records)

    // Build work units + skeleton + layout
    const workUnits = buildWorkUnits(model.operations, model.filesPerTile, model.project.repos[0]?.root ?? '')
    const { world } = buildWorldSkeleton(model, workUnits)
    solveLayout(world)

    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(5_000)
    expect(workUnits.length).toBeGreaterThan(0)
    expect(world.islands.length).toBeGreaterThanOrEqual(1)
  })

  it('reports pipeline metrics', async () => {
    const sizes = [100, 500, 1_000]
    const metrics: Array<{ size: number; parseMs: number; canonMs: number; layoutMs: number; totalMs: number; workUnits: number }> = []

    for (const size of sizes) {
      const content = generateLargeRecordSet(size)
      const file = new File([content], `bench-${size}.jsonl`)

      const t0 = performance.now()
      const parseResult = await parseUploadedFiles([file])
      const t1 = performance.now()

      const model = canonicalize(`bench-${size}`, parseResult.records)
      const t2 = performance.now()

      const workUnits = buildWorkUnits(model.operations, model.filesPerTile, model.project.repos[0]?.root ?? '')
      const { world } = buildWorldSkeleton(model, workUnits)
      solveLayout(world)
      const t3 = performance.now()

      metrics.push({
        size,
        parseMs: Math.round(t1 - t0),
        canonMs: Math.round(t2 - t1),
        layoutMs: Math.round(t3 - t2),
        totalMs: Math.round(t3 - t0),
        workUnits: workUnits.length,
      })
    }

    // Output metrics (visible in test output with --reporter=verbose)
    for (const m of metrics) {
      console.log(`[perf] ${m.size} events → parse: ${m.parseMs}ms, canon: ${m.canonMs}ms, layout: ${m.layoutMs}ms, total: ${m.totalMs}ms (${m.workUnits} work units)`)
    }

    // Verify linear-ish scaling (10x events shouldn't be more than 20x time)
    const smallest = metrics[0]!
    const largest = metrics.at(-1)!
    const sizeRatio = largest.size / smallest.size
    const timeRatio = largest.totalMs / Math.max(smallest.totalMs, 1)
    expect(timeRatio).toBeLessThan(sizeRatio * 3) // allow 3x slack over linear
  })
})
