import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { parseClaudeSessionFiles } from '../claude/parser'
import { normalizeClaudeRecords } from '../claude/normalize'

function buildSyntheticJsonl(lines: number): string {
  const rows: string[] = []
  for (let i = 0; i < lines; i += 1) {
    rows.push(
      JSON.stringify({
        type: 'assistant',
        ts: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.000Z`,
        content: [{ type: 'text', text: `message-${i}` }],
      }),
    )
  }
  return rows.join('\n')
}

export async function runPerformanceSmokeTest(): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'ingest-perf-'))
  const filePath = join(tempDir, 'synthetic.jsonl')

  try {
    await writeFile(filePath, buildSyntheticJsonl(10000), 'utf8')

    const started = Date.now()
    const parsed = await parseClaudeSessionFiles([filePath])
    const normalized = normalizeClaudeRecords(parsed.records)
    const elapsedMs = Date.now() - started

    assert.ok(parsed.records.length >= 10000)
    assert.ok(normalized.length >= 10000)
    assert.ok(elapsedMs < 30000)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
