// ============================================================================
// Local Discovery Adapter — Wraps ingest discoverClaudeSessions for API use
//
// Maps ClaudeSessionManifest[] → LocalSessionSummary[] with:
// - Newest-first sorting (by most recent file mtime)
// - Lightweight metadata derivation (totalBytes, estimatedEvents, etc.)
// - Optional project filter and limit
// ============================================================================

import { stat } from 'node:fs/promises'
import { discoverClaudeSessions } from '@multiverse/ingest/claude/discovery'
import type { ClaudeSessionManifest } from '@multiverse/ingest/types'
import type { LocalSessionSummary } from '@multiverse/shared/local-api-types'

/** Default base path for Claude Code transcripts */
const DEFAULT_CLAUDE_PROJECTS_PATH = (() => {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ''
  return `${home}/.claude/projects`
})()

/**
 * Get the configured Claude projects path.
 * Supports CLAUDE_PROJECTS_PATH env override for non-standard installations.
 */
export function getClaudeProjectsPath(): string {
  return process.env.CLAUDE_PROJECTS_PATH ?? DEFAULT_CLAUDE_PROJECTS_PATH
}

/**
 * Get the most recent mtime across all files in a session manifest.
 * Falls back to epoch if stat fails.
 */
async function getLatestMtime(manifest: ClaudeSessionManifest): Promise<number> {
  const allFiles = [...manifest.mainSessionFiles, ...manifest.subagentFiles]
  let latest = 0

  for (const file of allFiles) {
    try {
      const s = await stat(file.path)
      if (s.mtimeMs > latest) latest = s.mtimeMs
    } catch {
      // File may have been deleted between discovery and stat
    }
  }

  return latest
}

/**
 * Convert a ClaudeSessionManifest to a LocalSessionSummary.
 */
async function manifestToSummary(
  manifest: ClaudeSessionManifest,
): Promise<LocalSessionSummary> {
  const allFiles = [...manifest.mainSessionFiles, ...manifest.subagentFiles]
  const totalBytes = allFiles.reduce((sum, f) => sum + f.sizeBytes, 0)
  const estimatedEvents = allFiles.reduce(
    (sum, f) => sum + (f.estimatedEvents ?? 0),
    0,
  )
  const latestMtime = await getLatestMtime(manifest)

  return {
    sessionId: manifest.sessionId,
    project: manifest.project,
    fileCount: allFiles.length,
    estimatedEvents,
    totalBytes,
    hasSubagents: manifest.subagentFiles.length > 0,
    updatedAt: latestMtime > 0 ? new Date(latestMtime).toISOString() : new Date().toISOString(),
  }
}

export interface DiscoverSessionsOptions {
  /** Filter by project name substring */
  project?: string
  /** Maximum number of sessions to return */
  limit?: number
}

/**
 * Discover Claude Code sessions and return as LocalSessionSummary[].
 * Sorted newest-first by most recently modified file.
 *
 * Returns empty array (not error) if:
 * - ~/.claude/projects/ doesn't exist
 * - No matching sessions found
 */
export async function discoverLocalSessions(
  options: DiscoverSessionsOptions = {},
): Promise<LocalSessionSummary[]> {
  const basePath = getClaudeProjectsPath()
  const limit = options.limit ?? 50

  const manifests = await discoverClaudeSessions({
    basePath,
    projectFilter: options.project,
  })

  // Convert to summaries (need async for mtime lookup)
  const summaries = await Promise.all(manifests.map(manifestToSummary))

  // Sort newest-first
  summaries.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  // Apply limit
  return summaries.slice(0, limit)
}

/**
 * Find a specific session manifest by sessionId.
 * Returns null if not found.
 */
export async function findSessionManifest(
  sessionId: string,
): Promise<ClaudeSessionManifest | null> {
  const basePath = getClaudeProjectsPath()
  const manifests = await discoverClaudeSessions({ basePath })
  return manifests.find((m) => m.sessionId === sessionId) ?? null
}
