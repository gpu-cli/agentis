// ============================================================================
// Shared test fixtures for ingest tests
// ============================================================================

import type { BrowserParsedRecord } from '../../browser/parser'

/** Minimal JSONL content: 3 records with timestamps */
export const MINIMAL_JSONL = [
  '{"type":"user","ts":"2026-01-01T00:00:00Z","content":[{"type":"text","text":"Hello agent"}]}',
  '{"type":"assistant","ts":"2026-01-01T00:00:01Z","content":[{"type":"text","text":"Hi there"},{"type":"tool_use","name":"Read","input":{"file_path":"/project/src/main.ts"}}]}',
  '{"type":"assistant","ts":"2026-01-01T00:00:02Z","content":[{"type":"thinking","thinking":"let me think..."},{"type":"tool_use","name":"Write","input":{"file_path":"/project/src/utils.ts"}}]}',
].join('\n')

/** JSON array format with same data */
export const MINIMAL_JSON_ARRAY = JSON.stringify([
  { type: 'user', ts: '2026-01-01T00:00:00Z', content: [{ type: 'text', text: 'Hello agent' }] },
  { type: 'assistant', ts: '2026-01-01T00:00:01Z', content: [{ type: 'text', text: 'Hi there' }, { type: 'tool_use', name: 'Read', input: { file_path: '/project/src/main.ts' } }] },
  { type: 'assistant', ts: '2026-01-01T00:00:02Z', content: [{ type: 'thinking', thinking: 'let me think...' }, { type: 'tool_use', name: 'Write', input: { file_path: '/project/src/utils.ts' } }] },
])

/** JSONL with bad lines mixed in */
export const JSONL_WITH_ERRORS = [
  '{"type":"user","ts":"2026-01-01T00:00:00Z","content":[{"type":"text","text":"Hello"}]}',
  'NOT VALID JSON',
  '{"ts":"2026-01-01T00:00:01Z"}', // missing type field
  '42', // not an object
  '', // empty line
  '{"type":"assistant","ts":"2026-01-01T00:00:02Z","content":[{"type":"text","text":"OK"}]}',
].join('\n')

/** Records with cwd and gitBranch for canonicalizer */
export const RECORDS_WITH_CWD: BrowserParsedRecord[] = [
  {
    record: {
      type: 'assistant',
      ts: '2026-01-01T00:00:01.000Z',
      cwd: '/Users/dev/myproject',
      gitBranch: 'main',
      content: [
        { type: 'tool_use', name: 'Read', input: { file_path: '/Users/dev/myproject/src/main.ts' } },
      ],
    },
    fileName: 'session.jsonl',
    line: 1,
  },
  {
    record: {
      type: 'assistant',
      ts: '2026-01-01T00:00:02.000Z',
      cwd: '/Users/dev/myproject',
      gitBranch: 'main',
      content: [
        { type: 'tool_use', name: 'Write', input: { file_path: '/Users/dev/myproject/src/utils.ts' } },
      ],
    },
    fileName: 'session.jsonl',
    line: 2,
  },
  {
    record: {
      type: 'assistant',
      ts: '2026-01-01T00:00:03.000Z',
      cwd: '/Users/dev/myproject',
      gitBranch: 'main',
      content: [
        { type: 'tool_use', name: 'Edit', input: { file_path: '/Users/dev/myproject/src/main.ts' } },
      ],
    },
    fileName: 'session.jsonl',
    line: 3,
  },
  {
    record: {
      type: 'assistant',
      ts: '2026-01-01T00:00:04.000Z',
      cwd: '/Users/dev/myproject',
      gitBranch: 'main',
      content: [
        { type: 'tool_use', name: 'Bash', input: { command: 'npm test /Users/dev/myproject/src/main.ts' } },
      ],
    },
    fileName: 'session.jsonl',
    line: 4,
  },
  {
    record: {
      type: 'user',
      ts: '2026-01-01T00:00:00.000Z',
      content: [{ type: 'text', text: 'Fix the bug in main.ts' }],
    },
    fileName: 'session.jsonl',
    line: 5,
  },
]

/** Progress record with nested subagent */
export const PROGRESS_RECORD: BrowserParsedRecord = {
  record: {
    type: 'progress',
    ts: '2026-01-01T00:00:05.000Z',
    data: {
      type: 'agent_progress',
      agentId: 'sub123abc',
      message: {
        message: {
          content: [
            { type: 'text', text: 'Subagent working...' },
            { type: 'tool_use', name: 'Grep', input: { pattern: 'TODO', path: '/Users/dev/myproject/src' } },
          ],
        },
      },
    },
  },
  fileName: 'session.jsonl',
  line: 6,
}

/** Records with secrets for privacy testing */
export const RECORDS_WITH_SECRETS: BrowserParsedRecord[] = [
  {
    record: {
      type: 'user',
      ts: '2026-01-01T00:00:00.000Z',
      content: [{ type: 'text', text: 'Use this key: token_abcdefghijklmnop1234' }],
    },
    fileName: 'session.jsonl',
    line: 1,
  },
  {
    record: {
      type: 'assistant',
      ts: '2026-01-01T00:00:01.000Z',
      content: [{ type: 'text', text: 'Found GitHub PAT: ghp_123456789012345678901234567890123456' }],
    },
    fileName: 'session.jsonl',
    line: 2,
  },
]

/** Generate a large set of records for performance testing */
export function generateLargeRecordSet(count: number): string {
  const lines: string[] = []
  const baseTs = new Date('2026-01-01T00:00:00Z').getTime()
  const files = [
    '/project/src/main.ts',
    '/project/src/utils.ts',
    '/project/src/api/routes.ts',
    '/project/src/api/middleware.ts',
    '/project/src/db/schema.ts',
    '/project/src/db/queries.ts',
    '/project/tests/main.test.ts',
    '/project/tests/utils.test.ts',
    '/project/config/settings.ts',
    '/project/README.md',
  ]
  const tools = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob']

  for (let i = 0; i < count; i++) {
    const ts = new Date(baseTs + i * 100).toISOString()
    const file = files[i % files.length]
    const tool = tools[i % tools.length]

    if (i % 5 === 0) {
      lines.push(JSON.stringify({
        type: 'user',
        ts,
        content: [{ type: 'text', text: `Task ${i}: work on ${file}` }],
      }))
    } else {
      lines.push(JSON.stringify({
        type: 'assistant',
        ts,
        cwd: '/project',
        gitBranch: 'main',
        content: [
          { type: 'tool_use', name: tool, input: { file_path: file, command: `cat ${file}` } },
        ],
      }))
    }
  }

  return lines.join('\n')
}
