// ============================================================================
// Scenario 3: Cross-source Non-code Work — Research
// Researcher agent investigates patterns, writes an ADR, posts summary.
// Uses pipeline-compatible event format (source: agent_runtime, metadata:
// {category, action, status} base + extra fields for dispatch).
// ============================================================================

import type { AgentEvent, ScenarioData } from '../events'
import { createSeedSnapshot } from './seed-snapshot'

const base = 1708002000000

let seq = 0

function evt(
  id: string,
  offsetMs: number,
  type: AgentEvent['type'],
  kind: AgentEvent['kind'],
  target: AgentEvent['target'],
  metadata: AgentEvent['metadata'],
): AgentEvent {
  seq += 1
  return {
    id,
    schema_version: 1,
    dedupe_key: `run:trace-research:${id}`,
    source: 'agent_runtime',
    planet_id: 'planet_p1',
    agent_id: 'agent_researcher_1',
    seq,
    timestamp: base + offsetMs,
    kind,
    type,
    target,
    metadata,
  }
}

function buildEvents(): AgentEvent[] {
  seq = 0

  return [
    // 1. Research work item created
    evt('r01', 0, 'workitem_create', 'mutation',
      { workitem_id: 'workitem_RESEARCH_001' },
      { category: 'system', action: 'create', status: 'ok', title: 'ADR: API Gateway Pattern', priority: 'medium', type: 'research' },
    ),

    // 2. Agent starts research task
    evt('r02', 1000, 'task_start', 'mutation',
      { workitem_id: 'workitem_RESEARCH_001' },
      { category: 'subagent', action: 'delegate', status: 'ok', task: 'Research API gateway patterns and write decision doc' },
    ),

    // 3. Web search — gateway patterns
    evt('r03', 3500, 'tool_use', 'fx',
      { tool_id: 'tool_web_search' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 4. Web search — specific comparison
    evt('r04', 6000, 'tool_use', 'fx',
      { tool_id: 'tool_web_search' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 5. Read existing architecture docs
    evt('r05', 8500, 'tool_use', 'fx',
      { tool_id: 'tool_file_read', building_id: 'bld_docs_arch' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 6. Move to architecture docs building
    evt('r06', 10000, 'move', 'fx',
      { building_id: 'bld_docs_arch' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 7. Create ADR doc
    evt('r07', 12500, 'file_create', 'mutation',
      { building_id: 'bld_docs_arch', tile_id: 'tile_adr_001_md' },
      { category: 'file_change', action: 'create', status: 'ok', path: 'docs/architecture/adr-001-gateway.md', local: { x: 1, y: 1 } },
    ),

    // 8. Writing the decision doc (quill FX)
    evt('r08', 15000, 'tool_use', 'fx',
      { tool_id: 'tool_documentation', building_id: 'bld_docs_arch' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 9. Edit/refine the doc — add comparison table
    evt('r09', 18000, 'file_edit', 'mutation',
      { tile_id: 'tile_adr_001_md', building_id: 'bld_docs_arch' },
      { category: 'file_change', action: 'edit', status: 'ok' },
    ),

    // 10. Edit overview.md — cross-link the new ADR
    evt('r10', 20000, 'file_edit', 'mutation',
      { tile_id: 'tile_arch_overview', building_id: 'bld_docs_arch' },
      { category: 'file_change', action: 'edit', status: 'ok' },
    ),

    // 11. Git commit the ADR
    evt('r11', 22000, 'tool_use', 'fx',
      { tool_id: 'tool_git', building_id: 'bld_docs_arch' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 12. Slack summary posted
    evt('r12', 24000, 'message_send', 'mutation',
      { workitem_id: 'workitem_RESEARCH_001' },
      { category: 'conversation', action: 'create', status: 'ok' },
    ),

    // 13. Task complete
    evt('r13', 27000, 'task_complete', 'mutation',
      { workitem_id: 'workitem_RESEARCH_001' },
      { category: 'system', action: 'completed', status: 'ok' },
    ),
  ]
}

export function scenarioResearch(): ScenarioData {
  return {
    name: 'Research: API Gateway Decision',
    description:
      'Researcher agent investigates API gateway patterns, writes an ADR, cross-links existing docs, commits, and posts a summary to Slack.',
    snapshot: createSeedSnapshot(),
    events: buildEvents(),
  }
}
