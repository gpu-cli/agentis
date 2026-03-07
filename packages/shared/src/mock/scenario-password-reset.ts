// ============================================================================
// Scenario 1: Build a Feature — Password Reset
// Single agent implements password reset end-to-end.
// Uses pipeline-compatible event format (source: agent_runtime, metadata:
// {category, action, status} base + extra fields for dispatch).
// ============================================================================

import type { AgentEvent, ScenarioData } from '../events'
import { createSeedSnapshot } from './seed-snapshot'

const base = 1708000000000

function evt(
  id: string,
  seq: number,
  offsetMs: number,
  type: AgentEvent['type'],
  kind: AgentEvent['kind'],
  target: AgentEvent['target'],
  metadata: AgentEvent['metadata'],
  agentId = 'agent_eng_1',
): AgentEvent {
  return {
    id,
    schema_version: 1,
    dedupe_key: `run:trace-reset:${id}`,
    source: 'agent_runtime',
    planet_id: 'planet_p1',
    agent_id: agentId,
    seq,
    timestamp: base + offsetMs,
    kind,
    type,
    target,
    metadata,
  }
}

const events: AgentEvent[] = [
  // 1. Work item appears — ticket assigned
  evt('e01', 1, 0, 'workitem_create', 'mutation',
    { workitem_id: 'workitem_PROJ_456' },
    { category: 'system', action: 'create', status: 'ok', title: 'Password reset flow', priority: 'high', type: 'ticket' },
  ),

  // 2. Agent picks up the task
  evt('e02', 2, 1000, 'task_start', 'mutation',
    { workitem_id: 'workitem_PROJ_456' },
    { category: 'subagent', action: 'delegate', status: 'ok', task: 'Implement password reset flow' },
  ),

  // 3. Read existing auth code
  evt('e03', 3, 2500, 'tool_use', 'fx',
    { tool_id: 'tool_file_read', building_id: 'bld_auth' },
    { category: 'tool_call', action: 'completed', status: 'ok' },
  ),

  // 4. Move to auth building
  evt('e04', 4, 3500, 'move', 'fx',
    { building_id: 'bld_auth' },
    { category: 'tool_call', action: 'completed', status: 'ok' },
  ),

  // 5. Web search for best practices
  evt('e05', 5, 5000, 'tool_use', 'fx',
    { tool_id: 'tool_web_search', building_id: 'bld_auth' },
    { category: 'tool_call', action: 'completed', status: 'ok' },
  ),

  // 6. Create passwordReset.ts
  evt('e06', 6, 8000, 'file_create', 'mutation',
    { building_id: 'bld_auth', tile_id: 'tile_reset_ts' },
    { category: 'file_change', action: 'create', status: 'ok', path: 'src/auth/passwordReset.ts', local: { x: 2, y: 0 } },
  ),

  // 7. Code edit — writing the reset handler
  evt('e07', 7, 10000, 'tool_use', 'fx',
    { tool_id: 'tool_code_edit', building_id: 'bld_auth' },
    { category: 'tool_call', action: 'completed', status: 'ok' },
  ),

  // 8. Create resetEmail.ts
  evt('e08', 8, 13000, 'file_create', 'mutation',
    { building_id: 'bld_auth', tile_id: 'tile_email_ts' },
    { category: 'file_change', action: 'create', status: 'ok', path: 'src/auth/resetEmail.ts', local: { x: 2, y: 1 } },
  ),

  // 9. Edit passwordReset.ts — wire up email sending
  evt('e09', 9, 16000, 'file_edit', 'mutation',
    { tile_id: 'tile_reset_ts', building_id: 'bld_auth' },
    { category: 'file_change', action: 'edit', status: 'ok' },
  ),

  // 10. Move to routes building — add API endpoint
  evt('e10', 10, 18000, 'move', 'fx',
    { building_id: 'bld_routes' },
    { category: 'tool_call', action: 'completed', status: 'ok' },
  ),

  // 11. Edit routes.ts — add reset endpoint
  evt('e11', 11, 20000, 'file_edit', 'mutation',
    { building_id: 'bld_routes', tile_id: 'tile_routes_ts' },
    { category: 'file_change', action: 'edit', status: 'ok' },
  ),

  // 12. Run tests
  evt('e12', 12, 23000, 'tool_use', 'fx',
    { tool_id: 'tool_testing', building_id: 'bld_auth' },
    { category: 'tool_call', action: 'completed', status: 'ok' },
  ),

  // 13. Move to docs — write documentation
  evt('e13', 13, 26000, 'move', 'fx',
    { building_id: 'bld_docs' },
    { category: 'tool_call', action: 'completed', status: 'ok' },
  ),

  // 14. Create password-reset.md
  evt('e14', 14, 28000, 'file_create', 'mutation',
    { building_id: 'bld_docs', tile_id: 'tile_docs_reset' },
    { category: 'file_change', action: 'create', status: 'ok', path: 'docs/password-reset.md', local: { x: 2, y: 0 } },
  ),

  // 15. Edit docs — write content
  evt('e15', 15, 30000, 'tool_use', 'fx',
    { tool_id: 'tool_documentation', building_id: 'bld_docs' },
    { category: 'tool_call', action: 'completed', status: 'ok' },
  ),

  // 16. Git commit
  evt('e16', 16, 33000, 'tool_use', 'fx',
    { tool_id: 'tool_git', building_id: 'bld_auth' },
    { category: 'tool_call', action: 'completed', status: 'ok' },
  ),

  // 17. Deploy
  evt('e17', 17, 36000, 'tool_use', 'fx',
    { tool_id: 'tool_deploy', building_id: 'bld_service' },
    { category: 'tool_call', action: 'completed', status: 'ok' },
  ),

  // 18. Task complete
  evt('e18', 18, 40000, 'task_complete', 'mutation',
    { workitem_id: 'workitem_PROJ_456' },
    { category: 'system', action: 'completed', status: 'ok' },
  ),
]

export function scenarioPasswordReset(): ScenarioData {
  return {
    name: 'Build a Feature: Password Reset',
    description:
      'Single agent implements password reset end-to-end: reads existing code, creates files, edits routes, runs tests, writes docs, commits, and deploys.',
    snapshot: createSeedSnapshot(),
    events,
  }
}
