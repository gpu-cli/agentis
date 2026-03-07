import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

export interface ClaudeRawRecord {
  type: string
  ts?: string
  timestamp?: string
  [key: string]: unknown
}

export interface ClaudeRecordLocation {
  filePath: string
  line: number
}

export interface ClaudeParsedRecord {
  record: ClaudeRawRecord
  location: ClaudeRecordLocation
}

export interface ClaudeParseWarning {
  location: ClaudeRecordLocation
  message: string
}

export interface ClaudeParseResult {
  records: ClaudeParsedRecord[]
  warnings: ClaudeParseWarning[]
}

function hasTimestamp(record: ClaudeRawRecord): boolean {
  return typeof record.ts === 'string' || typeof record.timestamp === 'string'
}

export async function parseClaudeSessionFiles(
  paths: string[],
): Promise<ClaudeParseResult> {
  const records: ClaudeParsedRecord[] = []
  const warnings: ClaudeParseWarning[] = []

  for (const filePath of paths) {
    const reader = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Number.POSITIVE_INFINITY,
    })

    let lineNumber = 0
    for await (const rawLine of reader) {
      lineNumber += 1
      const line = rawLine.trim()
      if (line.length === 0) {
        continue
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        warnings.push({
          location: { filePath, line: lineNumber },
          message: 'invalid JSON line skipped',
        })
        continue
      }

      if (typeof parsed !== 'object' || parsed === null) {
        warnings.push({
          location: { filePath, line: lineNumber },
          message: 'non-object JSON record skipped',
        })
        continue
      }

      const candidate = parsed as Record<string, unknown>
      if (typeof candidate.type !== 'string') {
        warnings.push({
          location: { filePath, line: lineNumber },
          message: 'record missing type field',
        })
        continue
      }

      const record = candidate as ClaudeRawRecord
      if (!hasTimestamp(record)) {
        warnings.push({
          location: { filePath, line: lineNumber },
          message: 'record missing ts/timestamp field',
        })
      }

      records.push({
        record,
        location: { filePath, line: lineNumber },
      })
    }
  }

  return { records, warnings }
}
