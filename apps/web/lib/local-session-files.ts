// ============================================================================
// Local Session File Reader — Reads transcript file contents for a session
//
// Given a sessionId, resolves the session via discovery, reads all JSONL
// files, and returns the payload the frontend needs to reconstruct File[].
// ============================================================================

import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { findSessionManifest } from './local-discovery'
import type { LocalSessionFilesResponse, LocalSessionFile } from '@multiverse/shared/local-api-types'

/** Maximum total payload size (50MB) */
const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024

/**
 * Read all transcript files for a session.
 *
 * @returns LocalSessionFilesResponse on success
 * @throws Error with code-like messages for different failure modes:
 *   - "SESSION_NOT_FOUND" — sessionId doesn't match any discovered session
 *   - "NO_USABLE_FILES" — session exists but has no transcript files
 *   - "PAYLOAD_TOO_LARGE" — total file size exceeds 50MB cap
 */
export async function readSessionFiles(
  sessionId: string,
): Promise<LocalSessionFilesResponse> {
  const manifest = await findSessionManifest(sessionId)

  if (!manifest) {
    throw Object.assign(
      new Error(`Session "${sessionId}" not found in discovered sessions.`),
      { code: 'SESSION_NOT_FOUND' },
    )
  }

  const allFilePaths = [
    ...manifest.mainSessionFiles.map((f) => f.path),
    ...manifest.subagentFiles.map((f) => f.path),
  ]

  if (allFilePaths.length === 0) {
    throw Object.assign(
      new Error(`Session "${sessionId}" has no transcript files.`),
      { code: 'NO_USABLE_FILES' },
    )
  }

  // Check total size before reading
  let totalSize = 0
  for (const filePath of allFilePaths) {
    try {
      const s = await stat(filePath)
      totalSize += s.size
    } catch {
      // File may have been deleted; we'll skip it during read
    }
  }

  if (totalSize > MAX_PAYLOAD_BYTES) {
    throw Object.assign(
      new Error(
        `Session "${sessionId}" total size (${(totalSize / (1024 * 1024)).toFixed(1)}MB) exceeds the 50MB limit. ` +
        `Use manual upload with the Zip import mode for very large sessions.`,
      ),
      { code: 'PAYLOAD_TOO_LARGE' },
    )
  }

  // Read all files
  const files: LocalSessionFile[] = []
  for (const filePath of allFilePaths) {
    try {
      const content = await readFile(filePath, 'utf-8')
      const s = await stat(filePath)
      files.push({
        name: basename(filePath),
        content,
        sizeBytes: s.size,
      })
    } catch {
      // Skip files that can't be read (deleted, permissions, etc.)
    }
  }

  if (files.length === 0) {
    throw Object.assign(
      new Error(`Session "${sessionId}" files could not be read.`),
      { code: 'NO_USABLE_FILES' },
    )
  }

  return {
    projectName: manifest.project,
    sessionId: manifest.sessionId,
    files,
  }
}
