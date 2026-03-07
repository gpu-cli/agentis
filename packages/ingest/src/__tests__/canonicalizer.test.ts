// ============================================================================
// Canonicalizer — Records → CanonicalWorkModel tests (hq-gij.1.1)
// ============================================================================

import { describe, it, expect } from 'vitest'
import { canonicalize } from '../browser/canonicalizer'
import {
  RECORDS_WITH_CWD,
  PROGRESS_RECORD,
  RECORDS_WITH_SECRETS,
} from './fixtures/sample-records'

describe('canonicalize', () => {
  it('produces a CanonicalWorkModel with correct structure', () => {
    const model = canonicalize('test-project', RECORDS_WITH_CWD)

    expect(model.project.name).toBe('test-project')
    expect(model.project.nameConfidence).toBe('user_provided')
    expect(model.actors.length).toBeGreaterThan(0)
    expect(model.operations.length).toBeGreaterThan(0)
    expect(model.filesPerTile).toBeGreaterThanOrEqual(1)
  })

  it('derives correct actors from records', () => {
    const model = canonicalize('test', RECORDS_WITH_CWD)

    const actorIds = model.actors.map(a => a.id)
    // Should have both user and agent actors
    expect(actorIds).toContain('actor_user')
    expect(actorIds).toContain('actor_main')
  })

  it('classifies tool operations correctly', () => {
    const model = canonicalize('test', RECORDS_WITH_CWD)

    const readOps = model.operations.filter(op => op.kind === 'file_read')
    const writeOps = model.operations.filter(op => op.kind === 'file_write')
    const cmdOps = model.operations.filter(op => op.kind === 'command_run')

    expect(readOps.length).toBeGreaterThan(0)
    expect(writeOps.length).toBeGreaterThan(0)
    expect(cmdOps.length).toBeGreaterThan(0)
  })

  it('extracts target paths from tool inputs', () => {
    const model = canonicalize('test', RECORDS_WITH_CWD)

    const pathOps = model.operations.filter(op => op.targetPath !== null)
    expect(pathOps.length).toBeGreaterThan(0)
    expect(pathOps.some(op => op.targetPath!.includes('main.ts'))).toBe(true)
    expect(pathOps.some(op => op.targetPath!.includes('utils.ts'))).toBe(true)
  })

  it('infers repos from cwd fields', () => {
    const model = canonicalize('test', RECORDS_WITH_CWD)

    expect(model.project.repos.length).toBe(1)
    expect(model.project.repos[0]!.root).toBe('/Users/dev/myproject')
    expect(model.project.repos[0]!.name).toBe('myproject')
  })

  it('infers branches from gitBranch fields', () => {
    const model = canonicalize('test', RECORDS_WITH_CWD)

    const branches = model.project.repos[0]!.branches
    expect(branches.length).toBeGreaterThan(0)
    expect(branches.some(b => b.name === 'main')).toBe(true)
    expect(branches.find(b => b.name === 'main')!.isMain).toBe(true)
  })

  it('creates conversation operations from user records', () => {
    const model = canonicalize('test', RECORDS_WITH_CWD)

    const convOps = model.operations.filter(op => op.kind === 'conversation')
    expect(convOps.length).toBeGreaterThan(0)
    expect(convOps[0]!.actor.kind).toBe('human')
  })

  it('creates reasoning operations from thinking blocks', () => {
    const records = [
      {
        record: {
          type: 'assistant',
          ts: '2026-01-01T00:00:00.000Z',
          content: [{ type: 'thinking', thinking: 'deep thoughts...' }],
        },
        fileName: 'test.jsonl',
        line: 1,
      },
    ]
    const model = canonicalize('test', records)

    const reasoningOps = model.operations.filter(op => op.kind === 'reasoning')
    expect(reasoningOps.length).toBe(1)
    // Reasoning summary should be null (thinking is obfuscated)
    expect(reasoningOps[0]!.summary).toBeNull()
  })

  it('handles progress records with nested subagent', () => {
    const model = canonicalize('test', [PROGRESS_RECORD])

    // Should have subagent actor
    const subActors = model.actors.filter(a => a.kind === 'subagent')
    expect(subActors.length).toBe(1)
    expect(subActors[0]!.id).toContain('sub123abc')

    // Should have operations from subagent
    const subOps = model.operations.filter(op => op.actor.kind === 'subagent')
    expect(subOps.length).toBeGreaterThan(0)
  })

  it('scrubs secrets from operation summaries', () => {
    const model = canonicalize('test', RECORDS_WITH_SECRETS)

    const summaries = model.operations
      .map(op => op.summary)
      .filter((s): s is string => s !== null)

    for (const summary of summaries) {
      expect(summary).not.toContain('token_abcdef')
      expect(summary).not.toContain('ghp_')
    }
  })

  it('detects merge operations from git commands', () => {
    const records = [{
      record: {
        type: 'assistant',
        ts: '2026-01-01T00:00:00.000Z',
        content: [
          { type: 'tool_use', name: 'Bash', input: { command: 'git merge feature-branch' } },
        ],
      },
      fileName: 'test.jsonl',
      line: 1,
    }]
    const model = canonicalize('test', records)

    const mergeOps = model.operations.filter(op => op.kind === 'merge')
    expect(mergeOps.length).toBe(1)
  })

  it('detects branch switch operations', () => {
    const records = [{
      record: {
        type: 'assistant',
        ts: '2026-01-01T00:00:00.000Z',
        content: [
          { type: 'tool_use', name: 'Bash', input: { command: 'git checkout main' } },
        ],
      },
      fileName: 'test.jsonl',
      line: 1,
    }]
    const model = canonicalize('test', records)

    const switchOps = model.operations.filter(op => op.kind === 'branch_switch')
    expect(switchOps.length).toBe(1)
  })

  it('skips file-history-snapshot records', () => {
    const records = [{
      record: { type: 'file-history-snapshot', ts: '2026-01-01T00:00:00.000Z' },
      fileName: 'test.jsonl',
      line: 1,
    }]
    const model = canonicalize('test', records)

    expect(model.operations.length).toBe(0)
  })

  it('computes filesPerTile based on observed file count', () => {
    // < 10k files → 1 file per tile
    const model = canonicalize('test', RECORDS_WITH_CWD)
    expect(model.filesPerTile).toBe(1)
  })

  it('assigns sequential operation IDs', () => {
    const model = canonicalize('test', RECORDS_WITH_CWD)

    const ids = model.operations.map(op => op.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
    // All IDs should start with op_
    expect(ids.every(id => id.startsWith('op_'))).toBe(true)
  })

  it('tracks time range correctly', () => {
    const model = canonicalize('test', RECORDS_WITH_CWD)

    expect(model.project.source.timeRange.start).toBeGreaterThan(0)
    expect(model.project.source.timeRange.end).toBeGreaterThanOrEqual(model.project.source.timeRange.start)
  })

  it('is deterministic: same input produces same output', () => {
    const a = canonicalize('test', RECORDS_WITH_CWD)
    const b = canonicalize('test', RECORDS_WITH_CWD)

    expect(a.operations.length).toBe(b.operations.length)
    expect(a.actors.length).toBe(b.actors.length)
    expect(a.project.observedFileCount).toBe(b.project.observedFileCount)

    for (let i = 0; i < a.operations.length; i++) {
      expect(a.operations[i]!.id).toBe(b.operations[i]!.id)
      expect(a.operations[i]!.kind).toBe(b.operations[i]!.kind)
    }
  })
})
