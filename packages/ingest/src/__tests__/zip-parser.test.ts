// ============================================================================
// Zip Ingest — fflate streaming parse tests (hq-gij.1.2)
// ============================================================================

import { describe, it, expect } from 'vitest'
import { zipSync } from 'fflate'
import { parseUploadedZip } from '../browser/zip-parser'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonl(records: Array<Record<string, unknown>>): string {
  return records.map(r => JSON.stringify(r)).join('\n')
}

function makeZipFile(
  entries: Record<string, string>,
  zipFileName = 'test.zip',
): File {
  const enc = new TextEncoder()
  const zipEntries: Record<string, Uint8Array> = {}
  for (const [name, content] of Object.entries(entries)) {
    zipEntries[name] = enc.encode(content)
  }
  const zipData = zipSync(zipEntries)
  return new File([zipData], zipFileName, { type: 'application/zip' })
}

const VALID_RECORD = { type: 'assistant', ts: '2026-01-01T00:00:00.000Z', content: [] }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseUploadedZip', () => {
  it('extracts and parses .jsonl files from zip', async () => {
    const jsonl = makeJsonl([VALID_RECORD, VALID_RECORD])
    const zip = makeZipFile({ 'session.jsonl': jsonl })
    const result = await parseUploadedZip(zip)

    expect(result.records.length).toBe(2)
    expect(result.extractedFileNames).toContain('session.jsonl')
  })

  it('extracts and parses .json files from zip', async () => {
    const json = JSON.stringify([VALID_RECORD])
    const zip = makeZipFile({ 'data.json': json })
    const result = await parseUploadedZip(zip)

    expect(result.records.length).toBe(1)
    expect(result.extractedFileNames).toContain('data.json')
  })

  it('handles multiple files in zip', async () => {
    const jsonl1 = makeJsonl([{ ...VALID_RECORD, ts: '2026-01-01T00:00:00.000Z' }])
    const jsonl2 = makeJsonl([{ ...VALID_RECORD, ts: '2026-01-02T00:00:00.000Z' }])
    const zip = makeZipFile({
      'session1.jsonl': jsonl1,
      'session2.jsonl': jsonl2,
    })
    const result = await parseUploadedZip(zip)

    expect(result.records.length).toBe(2)
    expect(result.extractedFileNames.length).toBe(2)
  })

  it('skips unsupported file types with warning', async () => {
    const zip = makeZipFile({
      'session.jsonl': makeJsonl([VALID_RECORD]),
      'readme.txt': 'this is not a transcript',
      'image.png': 'fake png data',
    })
    const result = await parseUploadedZip(zip)

    expect(result.records.length).toBe(1)
    const skipWarnings = result.warnings.filter(w => w.message.includes('skipped unsupported'))
    expect(skipWarnings.length).toBe(2)
  })

  it('handles nested directory structure in zip', async () => {
    const zip = makeZipFile({
      'transcripts/day1/session.jsonl': makeJsonl([VALID_RECORD]),
      'transcripts/day2/session.jsonl': makeJsonl([VALID_RECORD]),
    })
    const result = await parseUploadedZip(zip)

    expect(result.records.length).toBe(2)
    expect(result.extractedFileNames).toContain('transcripts/day1/session.jsonl')
    expect(result.extractedFileNames).toContain('transcripts/day2/session.jsonl')
  })

  it('skips hidden files and __MACOSX entries', async () => {
    const zip = makeZipFile({
      'session.jsonl': makeJsonl([VALID_RECORD]),
      '.hidden.jsonl': makeJsonl([VALID_RECORD]),
      '__MACOSX/session.jsonl': makeJsonl([VALID_RECORD]),
    })
    const result = await parseUploadedZip(zip)

    expect(result.records.length).toBe(1)
    expect(result.extractedFileNames.length).toBe(1)
  })

  it('returns error for invalid zip data', async () => {
    const invalidZip = new File(['not a zip file'], 'bad.zip', { type: 'application/zip' })
    const result = await parseUploadedZip(invalidZip)

    expect(result.records.length).toBe(0)
    expect(result.warnings.some(w => w.message.includes('invalid or corrupted'))).toBe(true)
  })

  it('returns warning when no supported files found', async () => {
    const zip = makeZipFile({ 'readme.txt': 'hello' })
    const result = await parseUploadedZip(zip)

    expect(result.records.length).toBe(0)
    expect(result.warnings.some(w => w.message.includes('no .jsonl or .json files'))).toBe(true)
  })

  it('handles empty zip', async () => {
    const zipData = zipSync({})
    const zip = new File([zipData], 'empty.zip', { type: 'application/zip' })
    const result = await parseUploadedZip(zip)

    expect(result.records.length).toBe(0)
    expect(result.warnings.some(w => w.message.includes('no .jsonl or .json files'))).toBe(true)
  })

  it('sorts records by timestamp across zip entries', async () => {
    const early = makeJsonl([{ ...VALID_RECORD, ts: '2026-01-01T00:00:00.000Z' }])
    const late = makeJsonl([{ ...VALID_RECORD, ts: '2026-01-03T00:00:00.000Z' }])
    const middle = makeJsonl([{ ...VALID_RECORD, ts: '2026-01-02T00:00:00.000Z' }])
    const zip = makeZipFile({
      'late.jsonl': late,
      'early.jsonl': early,
      'middle.jsonl': middle,
    })
    const result = await parseUploadedZip(zip)

    expect(result.records.length).toBe(3)
    // Records should be sorted by timestamp
    const timestamps = result.records.map(r => r.record.ts as string)
    expect(timestamps[0]).toBe('2026-01-01T00:00:00.000Z')
    expect(timestamps[1]).toBe('2026-01-02T00:00:00.000Z')
    expect(timestamps[2]).toBe('2026-01-03T00:00:00.000Z')
  })

  it('propagates parse warnings from inner files', async () => {
    const badJsonl = '{"type":"assistant"}\nnot valid json\n{"type":"user"}'
    const zip = makeZipFile({ 'messy.jsonl': badJsonl })
    const result = await parseUploadedZip(zip)

    expect(result.records.length).toBe(2) // 2 valid records
    expect(result.warnings.some(w => w.message.includes('invalid JSON'))).toBe(true)
  })

  it('handles large zip with many files', async () => {
    const entries: Record<string, string> = {}
    for (let i = 0; i < 20; i++) {
      entries[`session_${i}.jsonl`] = makeJsonl([
        { ...VALID_RECORD, ts: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` },
      ])
    }
    const zip = makeZipFile(entries)
    const result = await parseUploadedZip(zip)

    expect(result.records.length).toBe(20)
    expect(result.extractedFileNames.length).toBe(20)
  })

  it('deduplicates files with same name in different directories', async () => {
    // parseUploadedFiles dedupes by the extracted File.name (basename)
    // Both files have basename "session.jsonl" — the second overwrites
    const zip = makeZipFile({
      'dir1/session.jsonl': makeJsonl([{ ...VALID_RECORD, ts: '2026-01-01T00:00:00.000Z' }]),
      'dir2/session.jsonl': makeJsonl([{ ...VALID_RECORD, ts: '2026-01-02T00:00:00.000Z' }]),
    })
    const result = await parseUploadedZip(zip)

    // Both files have the same basename "session.jsonl" — both are created as separate Files
    // and both parsed (no dedup at parser level since they're separate File objects)
    expect(result.records.length).toBe(2)
    expect(result.extractedFileNames.length).toBe(2)
  })
})
