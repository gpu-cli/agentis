// ============================================================================
// Transcript Persistence — localStorage save/load/clear for universal packages
// ============================================================================

import type { UniversalEventsPackage } from '@multiverse/shared'

const STORAGE_KEY = 'multiverse.transcript.universal.v1'
const CURRENT_SCHEMA_VERSION = 1

export interface StoredTranscript {
  schemaVersion: number
  savedAt: string
  projectName: string
  source: 'upload'
  package: UniversalEventsPackage
}

export interface LoadResult {
  status: 'found' | 'empty' | 'corrupt' | 'version_mismatch'
  data?: StoredTranscript
  error?: string
}

/**
 * Save a transcript package to localStorage.
 * Overwrites any existing saved transcript.
 * Returns true on success, false if localStorage quota exceeded or unavailable.
 */
export function saveTranscript(projectName: string, pkg: UniversalEventsPackage): boolean {
  const MAX_EVENTS_FOR_STORAGE = 2000
  if (pkg.events.length > MAX_EVENTS_FOR_STORAGE) {
    console.warn(`[transcript-persistence] skipping — ${pkg.events.length} events exceeds limit`)
    return false
  }

  try {
    const stored: StoredTranscript = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      projectName,
      source: 'upload',
      package: pkg,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    return true
  } catch (error) {
    console.warn('[transcript-persistence] save failed:', error)
    return false
  }
}

/**
 * Load a transcript package from localStorage.
 * Returns structured result with status for appropriate UI handling.
 */
export function loadTranscript(): LoadResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { status: 'empty' }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      clearTranscript()
      return { status: 'corrupt', error: 'Stored transcript data was not valid JSON.' }
    }

    if (typeof parsed !== 'object' || parsed === null) {
      clearTranscript()
      return { status: 'corrupt', error: 'Stored transcript data was not a valid object.' }
    }

    const stored = parsed as Record<string, unknown>

    // Check schema version
    if (stored.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      clearTranscript()
      return {
        status: 'version_mismatch',
        error: `Stored transcript uses schema version ${String(stored.schemaVersion)}, expected ${CURRENT_SCHEMA_VERSION}.`,
      }
    }

    // Basic structural check
    if (
      typeof stored.projectName !== 'string' ||
      typeof stored.savedAt !== 'string' ||
      typeof stored.package !== 'object' ||
      stored.package === null
    ) {
      clearTranscript()
      return { status: 'corrupt', error: 'Stored transcript has missing or invalid fields.' }
    }

    return {
      status: 'found',
      data: stored as unknown as StoredTranscript,
    }
  } catch (error) {
    console.warn('[transcript-persistence] load failed:', error)
    return { status: 'corrupt', error: 'Unable to access stored transcript data.' }
  }
}

/**
 * Clear saved transcript from localStorage.
 */
export function clearTranscript(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore — localStorage may be unavailable
  }
}

/**
 * Check if a saved transcript exists without fully loading it.
 */
export function hasSavedTranscript(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}
