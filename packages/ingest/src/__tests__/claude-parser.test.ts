import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { parseClaudeSessionFiles } from '../claude/parser'

export async function runParserEdgeCaseSmokeTest(): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'ingest-parser-'))
  const filePath = join(tempDir, 'session.jsonl')
  const payload = [
    '{"type":"assistant","ts":"2026-01-01T00:00:00.000Z","content":[{"type":"text","text":"ok"}]}',
    '{not-json}',
    '{"type":"progress"}',
    '{"bad":"record"}',
    '',
  ].join('\n')

  try {
    await writeFile(filePath, payload, 'utf8')
    const result = await parseClaudeSessionFiles([filePath])
    assert.equal(result.records.length, 2)
    assert.ok(result.warnings.length >= 2)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
