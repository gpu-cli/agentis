// ============================================================================
// Teams transcript fixture — simulates Claude Code Teams session
// with multiple parallel agents (each has a unique agentId)
// ============================================================================

import type { BrowserParsedRecord } from '../../browser/parser'

const BASE_TS = new Date('2026-01-15T10:00:00Z').getTime()

/**
 * Agent definitions: 5 team members working on different features.
 * Each has >= 3 tool operations so they get promoted from 'subagent' to 'agent'.
 */
const AGENTS = [
  { id: 'ae3f69b1-1111-4000-a000-000000000001', prompt: 'Implement user authentication system with JWT tokens and refresh flow' },
  { id: 'ae3f69b1-2222-4000-a000-000000000002', prompt: 'Add database migration scripts for the new schema. Make sure to test rollback scenarios' },
  { id: 'ae3f69b1-3333-4000-a000-000000000003', prompt: 'Fix CSS layout bugs in the dashboard component' },
  { id: 'ae3f69b1-4444-4000-a000-000000000004', prompt: 'Write unit tests for the API endpoints' },
  { id: 'ae3f69b1-5555-4000-a000-000000000005', prompt: 'Refactor error handling to use Result types' },
]

/** An unpromoted agent with only 1 tool op (stays as subagent) */
const MINOR_AGENT = {
  id: 'minor-agent-6666',
  prompt: 'Quick lookup',
}

function ts(offsetMs: number): string {
  return new Date(BASE_TS + offsetMs).toISOString()
}

/**
 * Build a progress record with nested tool_use for a team agent.
 */
function makeProgressToolUse(
  agentId: string,
  prompt: string,
  toolName: string,
  input: Record<string, unknown>,
  offsetMs: number,
  line: number,
): BrowserParsedRecord {
  return {
    record: {
      type: 'progress',
      ts: ts(offsetMs),
      isSidechain: false,
      data: {
        type: 'agent_progress',
        agentId,
        prompt,
        message: {
          message: {
            content: [
              { type: 'tool_use', name: toolName, input },
            ],
          },
        },
      },
    },
    fileName: 'teams-session.jsonl',
    line,
  }
}

/**
 * Build a progress record with text content.
 */
function makeProgressText(
  agentId: string,
  text: string,
  offsetMs: number,
  line: number,
): BrowserParsedRecord {
  return {
    record: {
      type: 'progress',
      ts: ts(offsetMs),
      isSidechain: false,
      data: {
        type: 'agent_progress',
        agentId,
        message: {
          message: {
            content: [
              { type: 'text', text },
            ],
          },
        },
      },
    },
    fileName: 'teams-session.jsonl',
    line,
  }
}

/**
 * Teams transcript fixture with 5 promoted agents, 1 minor subagent,
 * a user record, an assistant record, and queue-operation records.
 */
export const TEAMS_TRANSCRIPT_RECORDS: BrowserParsedRecord[] = [
  // Initial user prompt
  {
    record: {
      type: 'user',
      ts: ts(0),
      content: [{ type: 'text', text: 'Work on all the features in parallel' }],
    },
    fileName: 'teams-session.jsonl',
    line: 1,
  },

  // Assistant spawns tasks
  {
    record: {
      type: 'assistant',
      ts: ts(100),
      cwd: '/workspace/project',
      gitBranch: 'main',
      content: [
        { type: 'text', text: 'I\'ll distribute the work across team members.' },
        { type: 'tool_use', name: 'Agent', input: { prompt: AGENTS[0]!.prompt } },
      ],
    },
    fileName: 'teams-session.jsonl',
    line: 2,
  },

  // --- Agent 1: auth system (4 tool ops → promoted) ---
  makeProgressToolUse(AGENTS[0]!.id, AGENTS[0]!.prompt, 'Read', { file_path: '/workspace/project/src/auth/login.ts' }, 1000, 10),
  makeProgressToolUse(AGENTS[0]!.id, AGENTS[0]!.prompt, 'Write', { file_path: '/workspace/project/src/auth/jwt.ts' }, 2000, 11),
  makeProgressToolUse(AGENTS[0]!.id, AGENTS[0]!.prompt, 'Edit', { file_path: '/workspace/project/src/auth/login.ts' }, 3000, 12),
  makeProgressToolUse(AGENTS[0]!.id, AGENTS[0]!.prompt, 'Bash', { command: 'npm test /workspace/project/src/auth/' }, 4000, 13),
  makeProgressText(AGENTS[0]!.id, 'Auth system implemented with JWT flow', 4500, 14),

  // --- Agent 2: database migrations (3 tool ops → promoted) ---
  makeProgressToolUse(AGENTS[1]!.id, AGENTS[1]!.prompt, 'Read', { file_path: '/workspace/project/src/db/schema.ts' }, 1100, 20),
  makeProgressToolUse(AGENTS[1]!.id, AGENTS[1]!.prompt, 'Write', { file_path: '/workspace/project/src/db/migrations/001.sql' }, 2100, 21),
  makeProgressToolUse(AGENTS[1]!.id, AGENTS[1]!.prompt, 'Bash', { command: 'npm run migrate' }, 3100, 22),

  // --- Agent 3: CSS fixes (3 tool ops → promoted) ---
  makeProgressToolUse(AGENTS[2]!.id, AGENTS[2]!.prompt, 'Read', { file_path: '/workspace/project/src/components/Dashboard.css' }, 1200, 30),
  makeProgressToolUse(AGENTS[2]!.id, AGENTS[2]!.prompt, 'Edit', { file_path: '/workspace/project/src/components/Dashboard.css' }, 2200, 31),
  makeProgressToolUse(AGENTS[2]!.id, AGENTS[2]!.prompt, 'Grep', { pattern: 'flex-direction', path: '/workspace/project/src' }, 3200, 32),

  // --- Agent 4: unit tests (4 tool ops → promoted) ---
  makeProgressToolUse(AGENTS[3]!.id, AGENTS[3]!.prompt, 'Read', { file_path: '/workspace/project/src/api/routes.ts' }, 1300, 40),
  makeProgressToolUse(AGENTS[3]!.id, AGENTS[3]!.prompt, 'Write', { file_path: '/workspace/project/tests/api/routes.test.ts' }, 2300, 41),
  makeProgressToolUse(AGENTS[3]!.id, AGENTS[3]!.prompt, 'Bash', { command: 'npm test -- --reporter=verbose' }, 3300, 42),
  makeProgressToolUse(AGENTS[3]!.id, AGENTS[3]!.prompt, 'Edit', { file_path: '/workspace/project/tests/api/routes.test.ts' }, 4300, 43),

  // --- Agent 5: error handling refactor (3 tool ops → promoted) ---
  makeProgressToolUse(AGENTS[4]!.id, AGENTS[4]!.prompt, 'Read', { file_path: '/workspace/project/src/utils/errors.ts' }, 1400, 50),
  makeProgressToolUse(AGENTS[4]!.id, AGENTS[4]!.prompt, 'Edit', { file_path: '/workspace/project/src/utils/errors.ts' }, 2400, 51),
  makeProgressToolUse(AGENTS[4]!.id, AGENTS[4]!.prompt, 'Write', { file_path: '/workspace/project/src/utils/result.ts' }, 3400, 52),

  // --- Minor agent: only 1 tool op → stays as subagent ---
  makeProgressToolUse(MINOR_AGENT.id, MINOR_AGENT.prompt, 'Glob', { pattern: '*.md' }, 5000, 60),

  // --- Queue operation: task completion ---
  {
    record: {
      type: 'queue-operation',
      ts: ts(6000),
      operation: 'enqueue',
      content: '<task-notification task-id="task-001" status="completed">Auth system done</task-notification>',
    },
    fileName: 'teams-session.jsonl',
    line: 70,
  },

  // --- System record (should be ignored) ---
  {
    record: {
      type: 'system',
      ts: ts(7000),
      content: [],
    },
    fileName: 'teams-session.jsonl',
    line: 80,
  },
]

export { AGENTS as TEAMS_AGENTS, MINOR_AGENT }
