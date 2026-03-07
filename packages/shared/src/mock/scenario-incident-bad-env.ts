// ============================================================================
// Scenario 2: Incident / Monster — Bad Env Var
// Two agents collaborate to fix a production outage.
// Uses pipeline-compatible event format (source: agent_runtime, metadata:
// {category, action, status} base + extra fields for dispatch).
// ============================================================================

import type { AgentEvent, ScenarioData } from '../events'
import { createSeedSnapshot } from './seed-snapshot'

const base = 1708001000000

/** Per-agent sequence counters */
const seqs = { ops: 0, eng: 0 }

function evt(
  id: string,
  agent: 'ops' | 'eng',
  offsetMs: number,
  type: AgentEvent['type'],
  kind: AgentEvent['kind'],
  target: AgentEvent['target'],
  metadata: AgentEvent['metadata'],
): AgentEvent {
  const agentId = agent === 'ops' ? 'agent_ops_1' : 'agent_eng_2'
  seqs[agent] += 1
  return {
    id,
    schema_version: 1,
    dedupe_key: `run:trace-inc:${id}`,
    source: 'agent_runtime',
    planet_id: 'planet_p1',
    agent_id: agentId,
    seq: seqs[agent],
    timestamp: base + offsetMs,
    kind,
    type,
    target,
    metadata,
  }
}

function buildEvents(): AgentEvent[] {
  // Reset counters
  seqs.ops = 0
  seqs.eng = 0

  return [
    // 1. Ops triggers deploy
    evt('i01', 'ops', 0, 'tool_use', 'fx',
      { tool_id: 'tool_deploy', building_id: 'bld_service' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 2. Error spawns — API 500 spike
    evt('i02', 'ops', 2000, 'error_spawn', 'mutation',
      { monster_id: 'monster_INC_12', workitem_id: 'workitem_INC_12', building_id: 'bld_service' },
      { category: 'tool_call', action: 'completed', status: 'error', severity: 'critical', message: 'API 500 rate spike — ECONNREFUSED on api.internal:3000' },
    ),

    // 3. Ops starts combat with the monster
    evt('i03', 'ops', 2500, 'combat_start', 'fx',
      { monster_id: 'monster_INC_12' },
      { category: 'tool_call', action: 'started', status: 'ok' },
    ),

    // 4. Ops checks logs in terminal
    evt('i04', 'ops', 4000, 'tool_use', 'fx',
      { tool_id: 'tool_terminal', building_id: 'bld_service' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 5. Engineer paged via Slack
    evt('i05', 'eng', 5000, 'message_send', 'mutation',
      { workitem_id: 'workitem_INC_12' },
      { category: 'conversation', action: 'create', status: 'ok' },
    ),

    // 6. Engineer starts investigating
    evt('i06', 'eng', 6500, 'task_start', 'mutation',
      { workitem_id: 'workitem_INC_12' },
      { category: 'subagent', action: 'delegate', status: 'ok', task: 'Investigate prod API 500 spike' },
    ),

    // 7. Engineer reads service code
    evt('i07', 'eng', 8000, 'tool_use', 'fx',
      { tool_id: 'tool_file_read', building_id: 'bld_service' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 8. Engineer moves to config
    evt('i08', 'eng', 9500, 'move', 'fx',
      { building_id: 'bld_config' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 9. Engineer searches for env var fix
    evt('i09', 'eng', 11000, 'tool_use', 'fx',
      { tool_id: 'tool_web_search', building_id: 'bld_config' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 10. Ops fixes config — edit prod.env
    evt('i10', 'ops', 13000, 'file_edit', 'mutation',
      { building_id: 'bld_config', tile_id: 'tile_prod_env' },
      { category: 'file_change', action: 'edit', status: 'ok' },
    ),

    // 11. Ops moves to config building
    evt('i11', 'ops', 13500, 'move', 'fx',
      { building_id: 'bld_config' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 12. Ops commits the fix
    evt('i12', 'ops', 15000, 'tool_use', 'fx',
      { tool_id: 'tool_git', building_id: 'bld_config' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 13. Ops redeploys
    evt('i13', 'ops', 18000, 'tool_use', 'fx',
      { tool_id: 'tool_deploy', building_id: 'bld_service' },
      { category: 'tool_call', action: 'completed', status: 'ok' },
    ),

    // 14. Monster defeated
    evt('i14', 'ops', 22000, 'combat_end', 'fx',
      { monster_id: 'monster_INC_12' },
      { category: 'tool_call', action: 'completed', status: 'ok', outcome: 'defeated' },
    ),

    // 15. Work item resolved
    evt('i15', 'ops', 23000, 'workitem_update', 'mutation',
      { workitem_id: 'workitem_INC_12', monster_id: 'monster_INC_12' },
      { category: 'system', action: 'completed', status: 'ok', status_change: 'done' },
    ),

    // 16. Engineer task complete
    evt('i16', 'eng', 24000, 'task_complete', 'mutation',
      { workitem_id: 'workitem_INC_12' },
      { category: 'system', action: 'completed', status: 'ok' },
    ),
  ]
}

export function scenarioIncidentBadEnv(): ScenarioData {
  return {
    name: 'Incident: Bad Env Var',
    description:
      'Deploy introduces a bad env var causing 500s. Ops agent fights the error monster while engineer investigates. They fix config, redeploy, and defeat the monster.',
    snapshot: createSeedSnapshot(),
    events: buildEvents(),
  }
}
