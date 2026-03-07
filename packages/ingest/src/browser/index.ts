// ============================================================================
// Browser Ingest Pipeline — Public API
// Converts uploaded Claude transcript File[] → ScenarioData for rendering
// Zero node:* dependencies — runs entirely in the browser via crypto.subtle
// ============================================================================

import type { ScenarioData, UniversalEventsPackage } from '@multiverse/shared'

import { parseUploadedFiles } from './parser'
import { buildReplayPackage } from './builder'
import { buildBootstrapScenario } from './projector'
import { applyPrivacyRedaction } from './privacy'

// Re-export submodule types for consumers
export type { BrowserParsedRecord, BrowserParseWarning, BrowserParseResult } from './parser'
export type { ExtractedTopology } from './topology'

// Re-export key functions for advanced usage
export { parseUploadedFiles } from './parser'
export { buildReplayPackage } from './builder'
export { buildBootstrapScenario, projectToScenario } from './projector'
export { applyPrivacyRedaction, scrubSecrets } from './privacy'
export { sha256, deterministicId } from './hash'
export { extractTopology, extractCwdHints } from './topology'
export { canonicalize } from './canonicalizer'
export { parseUploadedZip } from './zip-parser'
export type { SizeValidationResult } from './size-validation'
export { validateFileSize, validateUncompressedSize, MAX_COMPRESSED_SIZE, MAX_UNCOMPRESSED_WARNING } from './size-validation'

// ---------------------------------------------------------------------------
// High-level convenience API
// ---------------------------------------------------------------------------

export interface ConvertResult {
  /** The universal events package (intermediate representation) */
  package: UniversalEventsPackage
  /** The ScenarioData ready for the rendering engine */
  scenario: ScenarioData
  /** Diagnostic warnings (non-fatal) */
  warnings: string[]
}

/**
 * Convert uploaded Claude transcript files into a renderable ScenarioData.
 *
 * This is the single entry point for the transcript import flow:
 * 1. Parse File[] → sorted records
 * 2. Build UniversalEventsPackage (with real SHA-256 hashing)
 * 3. Apply privacy redaction (secret scrubbing, path pseudonymization)
 * 4. Project to ScenarioData with full normalization + fallbacks
 *
 * @param projectName  User-provided project label (used for island naming)
 * @param files        Uploaded File[] objects (JSONL or JSON array format)
 * @returns            Package, scenario, and warnings
 */
export async function convertUploadedTranscripts(
  projectName: string,
  files: File[],
): Promise<ConvertResult> {
  // Step 1: Parse
  const { records, warnings: parseWarnings } = await parseUploadedFiles(files)
  const warnings = parseWarnings.map(
    (w) => `[parse] ${w.fileName}:${w.line}: ${w.message}`,
  )

  if (records.length === 0) {
    throw new Error(
      files.length === 0
        ? 'No files provided'
        : 'No valid transcript records found in uploaded files',
    )
  }

  // Step 2: Build universal events package
  const rawPackage = await buildReplayPackage(projectName, files, records)

  // Step 3: Apply privacy redaction
  const redactedPackage = await applyPrivacyRedaction(rawPackage)

  // Step 4: Project to ScenarioData with normalization
  const { scenario, warnings: projectorWarnings } = buildBootstrapScenario(redactedPackage)
  warnings.push(...projectorWarnings)

  return {
    package: redactedPackage,
    scenario,
    warnings,
  }
}
