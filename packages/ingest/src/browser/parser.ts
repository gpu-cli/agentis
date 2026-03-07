// ============================================================================
// Browser transcript parser — parses File[] objects (no node:fs, no node:readline)
// ============================================================================

export interface BrowserParsedRecord {
  record: Record<string, unknown>
  fileName: string
  line: number
}

export interface BrowserParseWarning {
  fileName: string
  line: number
  message: string
}

export interface BrowserParseResult {
  records: BrowserParsedRecord[]
  warnings: BrowserParseWarning[]
  /** Total bytes of input processed */
  totalBytes: number
  /** Projected uncompressed size in bytes */
  projectedUncompressedBytes: number
}

/**
 * Parse uploaded transcript files (JSONL or JSON array format).
 * Each line is expected to be a self-contained JSON object with a `type` field.
 * Records are sorted by timestamp for deterministic replay ordering.
 */
export async function parseUploadedFiles(files: File[]): Promise<BrowserParseResult> {
  const records: BrowserParsedRecord[] = []
  const warnings: BrowserParseWarning[] = []
  let totalBytes = 0
  let projectedUncompressedBytes = 0

  // Validate file sizes before processing
  const { validateFileSize } = await import('./size-validation')
  const sizeResult = validateFileSize(files)
  if (!sizeResult.valid) {
    // Hard-limit violations become parse warnings and we skip those files
    for (const err of sizeResult.errors) {
      warnings.push({ fileName: '', line: 0, message: err })
    }
  }
  for (const w of sizeResult.warnings) {
    warnings.push({ fileName: '', line: 0, message: w })
  }

  // Separate zip and non-zip files
  const zipFiles = files.filter(f => f.name.endsWith('.zip'))
  const nonZipFiles = files.filter(f => !f.name.endsWith('.zip'))

  // Process zip files first
  for (const zipFile of zipFiles) {
    totalBytes += zipFile.size
    const { parseUploadedZip } = await import('./zip-parser')
    const zipResult = await parseUploadedZip(zipFile)
    records.push(...zipResult.records)
    warnings.push(...zipResult.warnings)
    // Estimate uncompressed size from extracted records
    projectedUncompressedBytes += zipResult.records.reduce(
      (sum, r) => sum + JSON.stringify(r.record).length,
      0,
    )
  }

  // Process non-zip files
  for (const file of nonZipFiles) {
    // Skip files that exceed the hard size limit
    if (file.size > 50 * 1024 * 1024) continue

    totalBytes += file.size
    projectedUncompressedBytes += file.size

    const text = await file.text()

    // Detect JSON array format vs JSONL
    const trimmed = text.trim()
    if (trimmed.startsWith('[')) {
      // JSON array — parse as single array, emit one record per element
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed)) {
          parsed.forEach((item, index) => {
            if (typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).type === 'string') {
              records.push({
                record: item as Record<string, unknown>,
                fileName: file.name,
                line: index + 1,
              })
            } else {
              warnings.push({
                fileName: file.name,
                line: index + 1,
                message: 'array element missing type field or not an object',
              })
            }
          })
        } else {
          warnings.push({ fileName: file.name, line: 1, message: 'JSON file is not an array or object' })
        }
      } catch {
        warnings.push({ fileName: file.name, line: 1, message: 'invalid JSON in array-format file' })
      }
      continue
    }

    // JSONL format — line-by-line
    const lines = text.split(/\r?\n/u)
    lines.forEach((rawLine, index) => {
      const line = rawLine.trim()
      if (!line) return

      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        warnings.push({ fileName: file.name, line: index + 1, message: 'invalid JSON line skipped' })
        return
      }

      if (typeof parsed !== 'object' || parsed === null) {
        warnings.push({ fileName: file.name, line: index + 1, message: 'non-object JSON record skipped' })
        return
      }

      const record = parsed as Record<string, unknown>
      if (typeof record.type !== 'string') {
        warnings.push({ fileName: file.name, line: index + 1, message: 'record missing type field' })
        return
      }

      records.push({ record, fileName: file.name, line: index + 1 })
    })
  }

  // Validate uncompressed size
  const { validateUncompressedSize } = await import('./size-validation')
  const uncompressedResult = validateUncompressedSize(projectedUncompressedBytes)
  for (const w of uncompressedResult.warnings) {
    warnings.push({ fileName: '', line: 0, message: w })
  }
  if (!uncompressedResult.valid && uncompressedResult.errors.length > 0) {
    // Abort parsing with a descriptive error so callers can present it in UI
    const msg = uncompressedResult.errors.join('; ')
    throw new Error(msg)
  }

  // Sort by timestamp (numeric comparison), then by file name, then by line number
  records.sort((a, b) => {
    const aTime = parseTimestamp(getRecordTimestamp(a.record))
    const bTime = parseTimestamp(getRecordTimestamp(b.record))
    if (aTime !== bTime) return aTime - bTime

    const fileCompare = a.fileName.localeCompare(b.fileName)
    if (fileCompare !== 0) return fileCompare

    return a.line - b.line
  })

  return { records, warnings, totalBytes, projectedUncompressedBytes }
}

/** Extract timestamp string from a record */
export function getRecordTimestamp(record: Record<string, unknown>): string {
  const ts = typeof record.ts === 'string' ? record.ts
    : typeof record.timestamp === 'string' ? record.timestamp
    : null
  return ts ?? new Date(0).toISOString()
}

/** Parse ISO timestamp to epoch ms for numeric sorting */
function parseTimestamp(ts: string): number {
  const parsed = Date.parse(ts)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Extract content blocks from a record (handles top-level and nested progress shapes) */
export function getRecordBlocks(record: Record<string, unknown>): Array<Record<string, unknown>> {
  // Shape 1: top-level { content: [...] } (user/assistant records)
  if (Array.isArray(record.content)) {
    return record.content.filter(
      (block): block is Record<string, unknown> => typeof block === 'object' && block !== null,
    )
  }

  // Shape 2: { message: { content: [...] } }
  const message = record.message
  if (typeof message === 'object' && message !== null) {
    const content = (message as Record<string, unknown>).content
    if (Array.isArray(content)) {
      return content.filter(
        (block): block is Record<string, unknown> => typeof block === 'object' && block !== null,
      )
    }
  }

  return []
}

/**
 * Extract content blocks from a progress record's nested structure.
 * Progress records have tool activity at: data.message.message.content[]
 * Returns the nested blocks plus the agentId from data.agentId.
 */
export function getProgressNestedBlocks(
  record: Record<string, unknown>,
): { blocks: Array<Record<string, unknown>>; agentId: string | null } {
  const data = record.data
  if (typeof data !== 'object' || data === null) return { blocks: [], agentId: null }

  const dataObj = data as Record<string, unknown>
  const agentId = typeof dataObj.agentId === 'string' ? dataObj.agentId : null

  // Navigate: data.message.message.content[]
  const dataMessage = dataObj.message
  if (typeof dataMessage !== 'object' || dataMessage === null) return { blocks: [], agentId }

  const innerMessage = (dataMessage as Record<string, unknown>).message
  if (typeof innerMessage !== 'object' || innerMessage === null) return { blocks: [], agentId }

  const content = (innerMessage as Record<string, unknown>).content
  if (!Array.isArray(content)) return { blocks: [], agentId }

  const blocks = content.filter(
    (block): block is Record<string, unknown> => typeof block === 'object' && block !== null,
  )

  return { blocks, agentId }
}

/**
 * Classify a progress record's data.type — e.g. 'agent_progress', 'hook_progress'.
 */
export function getProgressDataType(record: Record<string, unknown>): string | null {
  const data = record.data
  if (typeof data !== 'object' || data === null) return null
  const dataType = (data as Record<string, unknown>).type
  return typeof dataType === 'string' ? dataType : null
}

/** Get actor ID from a record based on record type and agent fields */
export function getActorIdFromRecord(record: Record<string, unknown>): string {
  if (record.type === 'user') return 'actor_user'

  // Check top-level agentId first
  let rawAgent = typeof record.agentId === 'string' ? record.agentId : null

  // For progress records, also check data.agentId (nested subagent IDs)
  if (!rawAgent && record.type === 'progress') {
    const data = record.data
    if (typeof data === 'object' && data !== null) {
      const dataAgentId = (data as Record<string, unknown>).agentId
      if (typeof dataAgentId === 'string') {
        rawAgent = dataAgentId
      }
    }
  }

  if (record.isSidechain === true && rawAgent) return `actor_sub_${rawAgent}`

  return rawAgent ? `actor_agent_${rawAgent}` : 'actor_main'
}
