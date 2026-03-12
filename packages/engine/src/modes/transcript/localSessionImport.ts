// ============================================================================
// Local Session Import — Utilities for converting API payloads to File[]
//
// The existing import pipeline (TranscriptPage.handleImport) expects
// (projectName: string, files: File[]). This module bridges the gap
// between the local API response and that interface.
// ============================================================================

import type { LocalSessionFilesResponse } from '@multiverse/shared/local-api-types'

/**
 * Fetch transcript file contents for a session from the local API.
 *
 * @throws Error if the fetch fails or returns a non-OK status
 */
export async function fetchSessionFiles(
  sessionId: string,
): Promise<LocalSessionFilesResponse> {
  const response = await fetch(`/api/local/sessions/${encodeURIComponent(sessionId)}/files`)

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const message = (body as { message?: string }).message ?? `Failed to load session (${response.status})`
    throw new Error(message)
  }

  return response.json() as Promise<LocalSessionFilesResponse>
}

/**
 * Convert a LocalSessionFilesResponse into browser File[] objects
 * suitable for the existing onImport(projectName, files) pipeline.
 *
 * File objects are created from text content with correct MIME types
 * so the existing parser recognizes them.
 */
export function reconstructFiles(payload: LocalSessionFilesResponse): File[] {
  return payload.files.map((f) => {
    const mimeType = f.name.endsWith('.json')
      ? 'application/json'
      : 'application/x-ndjson'
    return new File([f.content], f.name, { type: mimeType })
  })
}
