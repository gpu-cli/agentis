// ============================================================================
// Teams transcript tests — verifies multi-agent promotion, name extraction,
// queue-operation parsing, and per-operation event generation
// ============================================================================

import { describe, it, expect } from 'vitest'
import { canonicalize } from '../browser/canonicalizer'
import { TEAMS_TRANSCRIPT_RECORDS, TEAMS_AGENTS, MINOR_AGENT } from './fixtures/teams-transcript'
import { RECORDS_WITH_CWD } from './fixtures/sample-records'
import {
  buildWorkUnits,
  BranchTracker,
  buildWorldSkeleton,
  solveLayout,
  toScenarioData,
} from '@multiverse/world-model'
import type { WorldModelSnapshot } from '@multiverse/world-model'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTeamsSnapshot(): WorldModelSnapshot {
  const cwm = canonicalize('teams-project', TEAMS_TRANSCRIPT_RECORDS)
  const defaultRepoRoot = cwm.project.repos[0]?.root ?? ''
  const workUnits = buildWorkUnits(cwm.operations, cwm.filesPerTile, defaultRepoRoot)
  const tracker = new BranchTracker()
  tracker.detectMerges(cwm.operations)
  tracker.applyToWorkUnits(workUnits)
  const skeleton = buildWorldSkeleton(cwm, workUnits)
  solveLayout(skeleton.world)

  return {
    version: 1,
    generatedAt: Date.now(),
    world: skeleton.world,
    workUnits: skeleton.workUnits,
    actors: cwm.actors,
    layoutMeta: {
      seed: 0,
      filesPerTile: cwm.filesPerTile,
      totalObservedFiles: cwm.project.observedFileCount,
      solverIterations: 1,
    },
    operations: cwm.operations,
  }
}

function buildSingleAgentSnapshot(): WorldModelSnapshot {
  const cwm = canonicalize('single-project', RECORDS_WITH_CWD)
  const defaultRepoRoot = cwm.project.repos[0]?.root ?? ''
  const workUnits = buildWorkUnits(cwm.operations, cwm.filesPerTile, defaultRepoRoot)
  const tracker = new BranchTracker()
  tracker.detectMerges(cwm.operations)
  tracker.applyToWorkUnits(workUnits)
  const skeleton = buildWorldSkeleton(cwm, workUnits)
  solveLayout(skeleton.world)

  return {
    version: 1,
    generatedAt: Date.now(),
    world: skeleton.world,
    workUnits: skeleton.workUnits,
    actors: cwm.actors,
    layoutMeta: {
      seed: 0,
      filesPerTile: cwm.filesPerTile,
      totalObservedFiles: cwm.project.observedFileCount,
      solverIterations: 1,
    },
    // No operations = single-agent legacy mode
  }
}

// ---------------------------------------------------------------------------
// Canonicalizer: Teams agent promotion
// ---------------------------------------------------------------------------

describe('teams transcript: canonicalization', () => {
  it('promotes team agents with >= 3 tool ops to kind=agent', () => {
    const cwm = canonicalize('teams-project', TEAMS_TRANSCRIPT_RECORDS)

    const promotedAgents = cwm.actors.filter(
      a => a.kind === 'agent' && a.id.startsWith('actor_sub_'),
    )

    // All 5 main team agents should be promoted
    expect(promotedAgents.length).toBe(5)

    // Each promoted agent should have an ID derived from their agentId
    for (const agent of TEAMS_AGENTS) {
      const found = promotedAgents.find(a => a.id === `actor_sub_${agent.id}`)
      expect(found).toBeDefined()
      expect(found!.kind).toBe('agent')
    }
  })

  it('keeps minor agents with < 3 tool ops as subagent', () => {
    const cwm = canonicalize('teams-project', TEAMS_TRANSCRIPT_RECORDS)

    const minorActor = cwm.actors.find(a => a.id === `actor_sub_${MINOR_AGENT.id}`)
    expect(minorActor).toBeDefined()
    expect(minorActor!.kind).toBe('subagent')
  })

  it('assigns friendly Greek letter names to promoted agents', () => {
    const cwm = canonicalize('teams-project', TEAMS_TRANSCRIPT_RECORDS)

    const promoted = cwm.actors.filter(
      a => a.id.startsWith('actor_sub_') && a.kind === 'agent',
    )
    const names = promoted.map(a => a.name)

    // Names should be short friendly Greek letters, not raw prompt text
    for (const name of names) {
      expect(name).not.toContain('Subagent')
      expect(name).not.toContain('Implement')
      expect(name.length).toBeLessThanOrEqual(10)
    }

    // Should include some known Greek letters
    const greekNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']
    expect(names.some(n => greekNames.includes(n))).toBe(true)
  })

  it('attaches prompt to promoted actors', () => {
    const cwm = canonicalize('teams-project', TEAMS_TRANSCRIPT_RECORDS)

    const promoted = cwm.actors.filter(
      a => a.id.startsWith('actor_sub_') && a.kind === 'agent',
    )
    // At least one agent should have a prompt attached
    const withPrompt = promoted.filter(a => a.prompt)
    expect(withPrompt.length).toBeGreaterThan(0)
  })

  it('handles queue-operation records as task_complete ops', () => {
    const cwm = canonicalize('teams-project', TEAMS_TRANSCRIPT_RECORDS)

    const taskCompleteOps = cwm.operations.filter(op => op.kind === 'task_complete')
    expect(taskCompleteOps.length).toBeGreaterThan(0)
    expect(taskCompleteOps[0]!.summary).toContain('task-001')
  })

  it('classifies new tool names correctly', () => {
    // Agent tool → task_spawn
    const agentRecord: import('../browser/parser').BrowserParsedRecord = {
      record: {
        type: 'assistant',
        ts: '2026-01-01T00:00:00.000Z',
        content: [{ type: 'tool_use', name: 'Agent', input: { prompt: 'do something' } }],
      },
      fileName: 'test.jsonl',
      line: 1,
    }
    const cwm = canonicalize('test', [agentRecord])
    const spawnOps = cwm.operations.filter(op => op.kind === 'task_spawn')
    expect(spawnOps.length).toBe(1)
  })

  it('preserves main agent actor alongside promoted agents', () => {
    const cwm = canonicalize('teams-project', TEAMS_TRANSCRIPT_RECORDS)

    const mainAgent = cwm.actors.find(a => a.id === 'actor_main')
    expect(mainAgent).toBeDefined()
    expect(mainAgent!.kind).toBe('agent')
  })
})

// ---------------------------------------------------------------------------
// Adapter: Teams agent rendering
// ---------------------------------------------------------------------------

describe('teams transcript: adapter', () => {
  it('renders promoted agents as full Agent sprites (not SubAgent)', () => {
    const snapshot = buildTeamsSnapshot()
    const scenario = toScenarioData(snapshot)

    // 5 promoted team agents + 1 main agent = 6 full agents
    const fullAgents = scenario.snapshot.agents
    expect(fullAgents.length).toBeGreaterThanOrEqual(6)

    // Minor agent should be a subagent
    const subAgents = scenario.snapshot.sub_agents
    const minorSub = subAgents.find(s => s.id === `actor_sub_${MINOR_AGENT.id}`)
    expect(minorSub).toBeDefined()
  })

  it('gives team agents distinct starting positions', () => {
    const snapshot = buildTeamsSnapshot()
    const scenario = toScenarioData(snapshot)

    const agentPositions = scenario.snapshot.agents.map(a => ({
      id: a.id,
      x: a.position.local_x,
      y: a.position.local_y,
    }))

    // At least some agents should have different positions
    const uniquePositions = new Set(agentPositions.map(p => `${p.x},${p.y}`))
    expect(uniquePositions.size).toBeGreaterThan(1)
  })

  it('generates per-operation events when operations are present', () => {
    const snapshot = buildTeamsSnapshot()
    const scenario = toScenarioData(snapshot)

    // Should have events from multiple agents
    const agentIdsInEvents = new Set(scenario.events.map(e => e.agent_id))
    expect(agentIdsInEvents.size).toBeGreaterThan(1)

    // Should have move events
    const moveEvents = scenario.events.filter(e => e.type === 'move')
    expect(moveEvents.length).toBeGreaterThan(0)

    // Should have file_edit events
    const editEvents = scenario.events.filter(e => e.type === 'file_edit')
    expect(editEvents.length).toBeGreaterThan(0)
  })

  it('events are temporally ordered', () => {
    const snapshot = buildTeamsSnapshot()
    const scenario = toScenarioData(snapshot)

    for (let i = 1; i < scenario.events.length; i++) {
      expect(scenario.events[i]!.timestamp).toBeGreaterThanOrEqual(
        scenario.events[i - 1]!.timestamp,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Regression: single-agent transcripts still work
// ---------------------------------------------------------------------------

describe('teams transcript: single-agent regression', () => {
  it('single-agent transcript produces 1 full agent (no regressions)', () => {
    const snapshot = buildSingleAgentSnapshot()
    const scenario = toScenarioData(snapshot)

    const agents = scenario.snapshot.agents
    expect(agents.length).toBe(1)
    expect(agents[0]!.id).toBe('actor_main')
  })

  it('single-agent uses work-unit events (no operations attached)', () => {
    const snapshot = buildSingleAgentSnapshot()
    const scenario = toScenarioData(snapshot)

    // Events should use wu-based dedupe keys
    expect(scenario.events.length).toBeGreaterThan(0)
    expect(scenario.events[0]!.dedupe_key).toMatch(/^wu:/)
  })

  it('produces no NaN or Infinity in teams output', () => {
    const snapshot = buildTeamsSnapshot()
    const scenario = toScenarioData(snapshot)

    const json = JSON.stringify(scenario)
    expect(json).not.toContain('NaN')
    expect(json).not.toContain('Infinity')
  })
})
