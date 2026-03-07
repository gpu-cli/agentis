// ============================================================================
// Ingest Parser — JSONL/JSON parse ordering + warnings (hq-gij.1.1)
// ============================================================================

import { describe, it, expect } from 'vitest'
import {
  parseUploadedFiles,
  getRecordTimestamp,
  getRecordBlocks,
  getProgressNestedBlocks,
  getProgressDataType,
  getActorIdFromRecord,
} from '../browser/parser'
import {
  MINIMAL_JSONL,
  MINIMAL_JSON_ARRAY,
  JSONL_WITH_ERRORS,
} from './fixtures/sample-records'

// ---------------------------------------------------------------------------
// Helpers — create File objects from strings
// ---------------------------------------------------------------------------

function makeFile(content: string, name: string): File {
  return new File([content], name, { type: 'application/octet-stream' })
}

// ---------------------------------------------------------------------------
// parseUploadedFiles
// ---------------------------------------------------------------------------

describe('parseUploadedFiles', () => {
  it('parses JSONL format and returns sorted records', async () => {
    const result = await parseUploadedFiles([makeFile(MINIMAL_JSONL, 'session.jsonl')])

    expect(result.records.length).toBe(3)
    expect(result.warnings.length).toBe(0)

    // Records should be sorted by timestamp
    const timestamps = result.records.map(r => getRecordTimestamp(r.record))
    for (let i = 1; i < timestamps.length; i++) {
      expect(Date.parse(timestamps[i]!)).toBeGreaterThanOrEqual(Date.parse(timestamps[i - 1]!))
    }
  })

  it('parses JSON array format', async () => {
    const result = await parseUploadedFiles([makeFile(MINIMAL_JSON_ARRAY, 'session.json')])

    expect(result.records.length).toBe(3)
    expect(result.warnings.length).toBe(0)

    // First record should be user
    expect(result.records[0]!.record.type).toBe('user')
  })

  it('produces identical records from JSONL and JSON array formats', async () => {
    const jsonl = await parseUploadedFiles([makeFile(MINIMAL_JSONL, 'a.jsonl')])
    const json = await parseUploadedFiles([makeFile(MINIMAL_JSON_ARRAY, 'b.json')])

    expect(jsonl.records.length).toBe(json.records.length)

    for (let i = 0; i < jsonl.records.length; i++) {
      const a = jsonl.records[i]!.record
      const b = json.records[i]!.record
      expect(a.type).toBe(b.type)
      expect(getRecordTimestamp(a)).toBe(getRecordTimestamp(b))
    }
  })

  it('generates warnings for bad JSONL lines', async () => {
    const result = await parseUploadedFiles([makeFile(JSONL_WITH_ERRORS, 'bad.jsonl')])

    // Should parse 2 valid records (user + assistant)
    expect(result.records.length).toBe(2)

    // Should have 3 warnings: invalid JSON, missing type, non-object
    expect(result.warnings.length).toBe(3)
    expect(result.warnings.some(w => w.message.includes('invalid JSON'))).toBe(true)
    expect(result.warnings.some(w => w.message.includes('missing type'))).toBe(true)
    expect(result.warnings.some(w => w.message.includes('non-object'))).toBe(true)
  })

  it('warns on invalid JSON array file', async () => {
    const result = await parseUploadedFiles([makeFile('[not valid json', 'bad.json')])

    expect(result.records.length).toBe(0)
    expect(result.warnings.length).toBe(1)
    expect(result.warnings[0]!.message).toContain('invalid JSON')
  })

  it('warns on JSON array with elements missing type', async () => {
    const content = JSON.stringify([{ ts: '2026-01-01T00:00:00Z' }, { type: 'user', ts: '2026-01-01T00:00:01Z', content: [] }])
    const result = await parseUploadedFiles([makeFile(content, 'partial.json')])

    expect(result.records.length).toBe(1)
    expect(result.warnings.length).toBe(1)
    expect(result.warnings[0]!.message).toContain('missing type')
  })

  it('warns when JSON file is not an array', async () => {
    // A quoted string starts with '"' not '[', so it's parsed as JSONL, not JSON array.
    // As JSONL, the parsed value is a string (non-object) → warning.
    const result = await parseUploadedFiles([makeFile('"just a string"', 'string.json')])

    expect(result.records.length).toBe(0)
    expect(result.warnings.length).toBe(1)
    expect(result.warnings[0]!.message).toContain('non-object')
  })

  it('handles multiple files merged by timestamp', async () => {
    const file1 = makeFile(
      '{"type":"user","ts":"2026-01-01T00:00:02Z","content":[{"type":"text","text":"second"}]}',
      'b.jsonl',
    )
    const file2 = makeFile(
      '{"type":"user","ts":"2026-01-01T00:00:00Z","content":[{"type":"text","text":"first"}]}',
      'a.jsonl',
    )

    const result = await parseUploadedFiles([file1, file2])
    expect(result.records.length).toBe(2)
    // First record should be the earlier timestamp regardless of file order
    expect(getRecordTimestamp(result.records[0]!.record)).toBe('2026-01-01T00:00:00Z')
    expect(getRecordTimestamp(result.records[1]!.record)).toBe('2026-01-01T00:00:02Z')
  })

  it('breaks timestamp ties by filename then line number', async () => {
    const sameTs = '2026-01-01T00:00:00Z'
    const fileA = makeFile(
      `{"type":"user","ts":"${sameTs}","content":[{"type":"text","text":"A1"}]}\n{"type":"user","ts":"${sameTs}","content":[{"type":"text","text":"A2"}]}`,
      'a.jsonl',
    )
    const fileB = makeFile(
      `{"type":"user","ts":"${sameTs}","content":[{"type":"text","text":"B1"}]}`,
      'b.jsonl',
    )

    const result = await parseUploadedFiles([fileB, fileA])
    expect(result.records.length).toBe(3)
    // a.jsonl should come before b.jsonl for same timestamp
    expect(result.records[0]!.fileName).toBe('a.jsonl')
    expect(result.records[0]!.line).toBe(1)
    expect(result.records[1]!.fileName).toBe('a.jsonl')
    expect(result.records[1]!.line).toBe(2)
    expect(result.records[2]!.fileName).toBe('b.jsonl')
  })

  it('handles empty file', async () => {
    const result = await parseUploadedFiles([makeFile('', 'empty.jsonl')])
    expect(result.records.length).toBe(0)
    expect(result.warnings.length).toBe(0)
  })

  it('handles records with no timestamp', async () => {
    const content = '{"type":"user","content":[{"type":"text","text":"no ts"}]}'
    const result = await parseUploadedFiles([makeFile(content, 'nots.jsonl')])
    expect(result.records.length).toBe(1)
    // Should fallback to epoch 0 timestamp
    expect(getRecordTimestamp(result.records[0]!.record)).toBe(new Date(0).toISOString())
  })
})

// ---------------------------------------------------------------------------
// getRecordTimestamp
// ---------------------------------------------------------------------------

describe('getRecordTimestamp', () => {
  it('prefers ts over timestamp', () => {
    expect(getRecordTimestamp({ ts: 'A', timestamp: 'B' })).toBe('A')
  })

  it('falls back to timestamp field', () => {
    expect(getRecordTimestamp({ timestamp: 'B' })).toBe('B')
  })

  it('returns epoch when no timestamp found', () => {
    expect(getRecordTimestamp({})).toBe(new Date(0).toISOString())
  })
})

// ---------------------------------------------------------------------------
// getRecordBlocks
// ---------------------------------------------------------------------------

describe('getRecordBlocks', () => {
  it('extracts top-level content array', () => {
    const blocks = getRecordBlocks({
      type: 'assistant',
      content: [{ type: 'text', text: 'hello' }, { type: 'thinking' }],
    })
    expect(blocks.length).toBe(2)
  })

  it('extracts nested message.content', () => {
    const blocks = getRecordBlocks({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'nested' }] },
    })
    expect(blocks.length).toBe(1)
    expect(blocks[0]!.text).toBe('nested')
  })

  it('returns empty array for no content', () => {
    expect(getRecordBlocks({ type: 'system' })).toEqual([])
  })

  it('filters out non-object content entries', () => {
    const blocks = getRecordBlocks({
      type: 'assistant',
      content: ['string', null, { type: 'text', text: 'valid' }, 42],
    })
    expect(blocks.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// getProgressNestedBlocks
// ---------------------------------------------------------------------------

describe('getProgressNestedBlocks', () => {
  it('extracts blocks from deeply nested progress structure', () => {
    const record = {
      type: 'progress',
      data: {
        agentId: 'sub1',
        message: {
          message: {
            content: [
              { type: 'text', text: 'working...' },
              { type: 'tool_use', name: 'Read', input: {} },
            ],
          },
        },
      },
    }

    const { blocks, agentId } = getProgressNestedBlocks(record)
    expect(blocks.length).toBe(2)
    expect(agentId).toBe('sub1')
  })

  it('returns empty for missing data', () => {
    const { blocks, agentId } = getProgressNestedBlocks({})
    expect(blocks.length).toBe(0)
    expect(agentId).toBeNull()
  })

  it('returns empty for missing nested message', () => {
    const { blocks } = getProgressNestedBlocks({ data: { agentId: 'x' } })
    expect(blocks.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getProgressDataType
// ---------------------------------------------------------------------------

describe('getProgressDataType', () => {
  it('extracts data.type', () => {
    expect(getProgressDataType({ data: { type: 'agent_progress' } })).toBe('agent_progress')
  })

  it('returns null for missing data', () => {
    expect(getProgressDataType({})).toBeNull()
  })

  it('returns null for non-string type', () => {
    expect(getProgressDataType({ data: { type: 42 } })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getActorIdFromRecord
// ---------------------------------------------------------------------------

describe('getActorIdFromRecord', () => {
  it('returns actor_user for user records', () => {
    expect(getActorIdFromRecord({ type: 'user' })).toBe('actor_user')
  })

  it('returns actor_main for assistant without agentId', () => {
    expect(getActorIdFromRecord({ type: 'assistant' })).toBe('actor_main')
  })

  it('returns actor_agent_<id> for assistant with agentId', () => {
    expect(getActorIdFromRecord({ type: 'assistant', agentId: 'abc' })).toBe('actor_agent_abc')
  })

  it('returns actor_sub_<id> for sidechain agents', () => {
    expect(getActorIdFromRecord({ type: 'assistant', agentId: 'abc', isSidechain: true })).toBe('actor_sub_abc')
  })

  it('extracts agentId from progress data (without isSidechain → agent prefix)', () => {
    // Without isSidechain: true, progress data.agentId uses actor_agent_ prefix
    expect(getActorIdFromRecord({
      type: 'progress',
      data: { agentId: 'sub1' },
    })).toBe('actor_agent_sub1')
  })

  it('extracts agentId from progress data with isSidechain', () => {
    expect(getActorIdFromRecord({
      type: 'progress',
      isSidechain: true,
      data: { agentId: 'sub1' },
    })).toBe('actor_sub_sub1')
  })
})
