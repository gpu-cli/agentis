// ============================================================================
// Local API Types — Shared between Next.js API routes and frontend hooks
// Used exclusively by the local auto-discovery flow (AGENTIS_LOCAL_MODE)
// ============================================================================

/**
 * Summary of a discovered Claude Code session.
 * Returned by GET /api/local/sessions.
 */
export interface LocalSessionSummary {
  /** Unique session identifier (from JSONL filename) */
  sessionId: string
  /** Project name (directory name under ~/.claude/projects/) */
  project: string
  /** Number of transcript files (main + subagent) */
  fileCount: number
  /** Estimated total events across all files */
  estimatedEvents: number
  /** Total size in bytes across all files */
  totalBytes: number
  /** Whether this session has subagent transcript files */
  hasSubagents: boolean
  /** ISO timestamp of the most recently modified file */
  updatedAt: string
}

/**
 * File payload for a single transcript file.
 * Returned as part of LocalSessionFilesResponse.
 */
export interface LocalSessionFile {
  /** Filename (e.g., "abc123.jsonl") */
  name: string
  /** Full text content of the file */
  content: string
  /** File size in bytes */
  sizeBytes: number
}

/**
 * Response from GET /api/local/sessions/:sessionId/files.
 * Contains everything the frontend needs to reconstruct File[]
 * and pass through the existing import pipeline.
 */
export interface LocalSessionFilesResponse {
  /** Derived project name for the import */
  projectName: string
  /** Session ID */
  sessionId: string
  /** Transcript file contents */
  files: LocalSessionFile[]
}

/**
 * Structured error response from /api/local/* endpoints.
 */
export interface LocalApiError {
  /** Machine-readable error code */
  code:
    | 'local_mode_disabled'
    | 'not_loopback'
    | 'session_not_found'
    | 'no_usable_files'
    | 'payload_too_large'
    | 'discovery_failed'
    | 'internal_error'
  /** Human-readable error message (safe to display) */
  message: string
}
