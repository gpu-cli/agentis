// ============================================================================
// Zip transcript parser — parses .zip files containing .jsonl/.json transcripts
// Uses fflate for streaming decompression in the browser.
// ============================================================================

import { unzipSync } from 'fflate'
import { parseUploadedFiles } from './parser'
import type { BrowserParseResult, BrowserParseWarning } from './parser'

export interface ZipParseResult extends BrowserParseResult {
  /** Names of files extracted from the zip */
  extractedFileNames: string[]
}

/**
 * Parse a zip file containing transcript files (.jsonl/.json).
 * Extracts all supported files from the zip and parses them.
 */
export async function parseUploadedZip(zipFile: File): Promise<ZipParseResult> {
  const warnings: BrowserParseWarning[] = []

  let zipBuffer: ArrayBuffer
  try {
    zipBuffer = await zipFile.arrayBuffer()
  } catch {
    return {
      records: [],
      warnings: [{ fileName: zipFile.name, line: 0, message: 'failed to read zip file' }],
      extractedFileNames: [],
      totalBytes: 0,
      projectedUncompressedBytes: 0,
    }
  }

  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(zipBuffer))
  } catch {
    return {
      records: [],
      warnings: [{ fileName: zipFile.name, line: 0, message: 'invalid or corrupted zip file' }],
      extractedFileNames: [],
      totalBytes: 0,
      projectedUncompressedBytes: 0,
    }
  }

  const supportedFiles: File[] = []
  const extractedFileNames: string[] = []

  for (const [path, data] of Object.entries(entries)) {
    // Skip directories, hidden files, and macOS resource forks
    if (path.includes('__MACOSX')) continue
    const fileName = path.split('/').pop() ?? path
    if (!fileName || fileName.startsWith('.')) continue

    // Only accept .jsonl and .json files
    if (!fileName.endsWith('.jsonl') && !fileName.endsWith('.json')) {
      warnings.push({
        fileName: `${zipFile.name}/${path}`,
        line: 0,
        message: `skipped unsupported file type: ${fileName}`,
      })
      continue
    }

    // Convert Uint8Array to File for parseUploadedFiles
    const blob = new Blob([data], { type: 'application/json' })
    const file = new File([blob], fileName, { type: 'application/json' })
    supportedFiles.push(file)
    extractedFileNames.push(path)
  }

  if (supportedFiles.length === 0) {
    return {
      records: [],
      warnings: [
        ...warnings,
        { fileName: zipFile.name, line: 0, message: 'no .jsonl or .json files found in zip' },
      ],
      extractedFileNames: [],
      totalBytes: 0,
      projectedUncompressedBytes: 0,
    }
  }

  // Parse extracted files using existing parser
  const result = await parseUploadedFiles(supportedFiles)

  return {
    records: result.records,
    warnings: [...warnings, ...result.warnings],
    extractedFileNames,
    totalBytes: result.totalBytes,
    projectedUncompressedBytes: result.projectedUncompressedBytes,
  }
}
