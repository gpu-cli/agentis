// ============================================================================
// Size Cap Validation tests (hq-gij.1.3)
// ============================================================================

import { describe, it, expect } from 'vitest'
import {
  validateFileSize,
  validateUncompressedSize,
  MAX_COMPRESSED_SIZE,
  MAX_UNCOMPRESSED_WARNING,
  MAX_SINGLE_FILE_SIZE,
} from '../browser/size-validation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, sizeBytes: number): File {
  const data = new Uint8Array(sizeBytes)
  return new File([data], name, { type: 'application/octet-stream' })
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('size constants', () => {
  it('MAX_COMPRESSED_SIZE is 5MB', () => {
    expect(MAX_COMPRESSED_SIZE).toBe(5 * 1024 * 1024)
  })

  it('MAX_UNCOMPRESSED_WARNING is 20MB', () => {
    expect(MAX_UNCOMPRESSED_WARNING).toBe(20 * 1024 * 1024)
  })

  it('MAX_SINGLE_FILE_SIZE is 50MB', () => {
    expect(MAX_SINGLE_FILE_SIZE).toBe(50 * 1024 * 1024)
  })
})

// ---------------------------------------------------------------------------
// validateFileSize
// ---------------------------------------------------------------------------

describe('validateFileSize', () => {
  it('accepts small files', () => {
    const files = [makeFile('session.jsonl', 1024)]
    const result = validateFileSize(files)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('accepts multiple small files', () => {
    const files = [
      makeFile('session1.jsonl', 1024),
      makeFile('session2.jsonl', 2048),
      makeFile('session3.jsonl', 512),
    ]
    const result = validateFileSize(files)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rejects zip files exceeding 5MB compressed limit', () => {
    const files = [makeFile('big.zip', MAX_COMPRESSED_SIZE + 1)]
    const result = validateFileSize(files)

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('compressed size limit')
    expect(result.errors[0]).toContain('big.zip')
  })

  it('accepts zip files at exactly 5MB', () => {
    const files = [makeFile('exact.zip', MAX_COMPRESSED_SIZE)]
    const result = validateFileSize(files)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('does not apply compressed limit to non-zip files', () => {
    // A 6MB .jsonl file should not trigger compressed limit
    const files = [makeFile('big.jsonl', MAX_COMPRESSED_SIZE + 1024 * 1024)]
    const result = validateFileSize(files)

    expect(result.valid).toBe(true)
    expect(result.errors.filter(e => e.includes('compressed'))).toEqual([])
  })

  it('rejects individual files exceeding 50MB', () => {
    const files = [makeFile('huge.jsonl', MAX_SINGLE_FILE_SIZE + 1)]
    const result = validateFileSize(files)

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('maximum file size')
  })

  it('warns when total size exceeds 20MB', () => {
    const files = [
      makeFile('a.jsonl', 11 * 1024 * 1024),
      makeFile('b.jsonl', 10 * 1024 * 1024),
    ]
    const result = validateFileSize(files)

    expect(result.valid).toBe(true) // warning, not error
    expect(result.warnings.length).toBe(1)
    expect(result.warnings[0]).toContain('Total file size')
    expect(result.warnings[0]).toContain('slow')
  })

  it('does not warn when total size is under 20MB', () => {
    const files = [
      makeFile('a.jsonl', 5 * 1024 * 1024),
      makeFile('b.jsonl', 5 * 1024 * 1024),
    ]
    const result = validateFileSize(files)

    expect(result.warnings).toEqual([])
  })

  it('reports multiple errors for multiple violations', () => {
    const files = [
      makeFile('huge.jsonl', MAX_SINGLE_FILE_SIZE + 1),
      makeFile('big.zip', MAX_COMPRESSED_SIZE + 1),
    ]
    const result = validateFileSize(files)

    expect(result.valid).toBe(false)
    // huge.jsonl → max file size error
    // big.zip → compressed size error AND max file size error
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })

  it('handles empty file list', () => {
    const result = validateFileSize([])

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('handles zero-byte files', () => {
    const files = [makeFile('empty.jsonl', 0)]
    const result = validateFileSize(files)

    expect(result.valid).toBe(true)
  })

  it('formats bytes correctly in error messages', () => {
    const files = [makeFile('big.zip', 6 * 1024 * 1024)]
    const result = validateFileSize(files)

    expect(result.errors[0]).toContain('6.0MB')
    expect(result.errors[0]).toContain('5.0MB')
  })
})

// ---------------------------------------------------------------------------
// validateUncompressedSize
// ---------------------------------------------------------------------------

describe('validateUncompressedSize', () => {
  it('accepts small uncompressed content', () => {
    const result = validateUncompressedSize(1024)
    expect(result.valid).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('warns when uncompressed content exceeds 20MB', () => {
    const result = validateUncompressedSize(MAX_UNCOMPRESSED_WARNING + 1)
    expect(result.valid).toBe(true) // valid, just warning
    expect(result.warnings.length).toBe(1)
    expect(result.warnings[0]).toContain('Uncompressed content')
  })

  it('does not warn at exactly 20MB', () => {
    const result = validateUncompressedSize(MAX_UNCOMPRESSED_WARNING)
    expect(result.warnings).toEqual([])
  })

  it('is always valid (soft limit only)', () => {
    const result = validateUncompressedSize(100 * 1024 * 1024)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })
})
