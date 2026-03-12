// ============================================================================
// Local Mode Guard — Central check for AGENTIS_LOCAL_MODE
//
// Environment variables:
//   AGENTIS_LOCAL_MODE        — Server-side: enables /api/local/* routes
//   NEXT_PUBLIC_AGENTIS_LOCAL — Client-side: enables auto-detected sessions UI
//
// Relationship with NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT:
//   - NEXT_PUBLIC_ENABLE_INTERNAL_TRANSCRIPT gates the transcript upload UI
//     in hosted mode (set to "true" for internal use / local dev).
//   - AGENTIS_LOCAL_MODE gates the local filesystem discovery APIs.
//   - Both are "true" when running via @agentis/local package.
// ============================================================================

/**
 * Whether the server is running in local mode (filesystem access enabled).
 * Only check this on the server side (API routes).
 */
export function isLocalMode(): boolean {
  return process.env.AGENTIS_LOCAL_MODE === 'true'
}

/**
 * Whether local mode is available on the client side.
 * Uses the NEXT_PUBLIC_ prefixed version so Next.js inlines it at build time.
 */
export function isLocalModeClient(): boolean {
  return process.env.NEXT_PUBLIC_AGENTIS_LOCAL === 'true'
}
