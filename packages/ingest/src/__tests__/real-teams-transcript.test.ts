// ============================================================================
// Real Teams Transcript Integration Test
// Uses a minimized extract from a real Claude Code Teams session
// (f68377d8-de12-4b21-95c4-3cdbf86d0b2e.jsonl) with 19 parallel agents.
// PII scrubbed, content truncated, synthetic timestamps added.
// ============================================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseUploadedFiles } from '../browser/parser'
import { canonicalize } from '../browser/canonicalizer'
import {
  buildWorkUnits,
  BranchTracker,
  buildWorldSkeleton,
  solveLayout,
  toScenarioData,
} from '@multiverse/world-model'
import type { WorldModelSnapshot } from '@multiverse/world-model'

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

function loadFixtureRecords() {
  const fixturePath = join(__dirname, 'fixtures', 'real-teams-session.jsonl')
  const content = readFileSync(fixturePath, 'utf-8')
  return content
}

async function parseFixture() {
  const content = loadFixtureRecords()
  const file = new File([content], 'real-teams-session.jsonl')
  const { records } = await parseUploadedFiles([file])
  return records
}

async function buildFullPipeline() {
  const records = await parseFixture()
  const cwm = canonicalize('real-teams-project', records)
  const defaultRepoRoot = cwm.project.repos[0]?.root ?? ''
  const workUnits = buildWorkUnits(cwm.operations, cwm.filesPerTile, defaultRepoRoot)
  const tracker = new BranchTracker()
  tracker.detectMerges(cwm.operations)
  tracker.applyToWorkUnits(workUnits)
  const skeleton = buildWorldSkeleton(cwm, workUnits)
  solveLayout(skeleton.world)

  const snapshot: WorldModelSnapshot = {
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

  return { cwm, snapshot, scenario: toScenarioData(snapshot) }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('real teams transcript: end-to-end', () => {
  it('parses all records from the fixture', async () => {
    const records = await parseFixture()
    expect(records.length).toBeGreaterThan(0)
  })

  it('discovers 19 unique agents', async () => {
    const records = await parseFixture()
    const cwm = canonicalize('test', records)

    // 19 team agents + actor_main + actor_user = at least 21 actors
    const subActors = cwm.actors.filter(a => a.id.startsWith('actor_sub_'))
    expect(subActors.length).toBe(19)
  })

  it('promotes 18 agents with >= 3 tool ops', async () => {
    const records = await parseFixture()
    const cwm = canonicalize('test', records)

    const promoted = cwm.actors.filter(
      a => a.id.startsWith('actor_sub_') && a.kind === 'agent',
    )
    expect(promoted.length).toBe(18)
  })

  it('keeps 1 agent with < 3 tool ops as subagent', async () => {
    const records = await parseFixture()
    const cwm = canonicalize('test', records)

    const minor = cwm.actors.filter(
      a => a.id.startsWith('actor_sub_') && a.kind === 'subagent',
    )
    expect(minor.length).toBe(1)
  })

  it('assigns friendly names to promoted agents (not raw prompts)', async () => {
    const records = await parseFixture()
    const cwm = canonicalize('test', records)

    const promoted = cwm.actors.filter(
      a => a.id.startsWith('actor_sub_') && a.kind === 'agent',
    )
    for (const agent of promoted) {
      // Should be short friendly names, not raw prompt text
      expect(agent.name).not.toMatch(/^Subagent /u)
      expect(agent.name).not.toContain('Implement')
      expect(agent.name.length).toBeLessThanOrEqual(10)
    }
  })

  it('renders promoted agents as full Agent sprites', async () => {
    const { scenario } = await buildFullPipeline()

    // 18 promoted + actor_main = at least 19 full agents
    const agents = scenario.snapshot.agents
    expect(agents.length).toBeGreaterThanOrEqual(19)

    // The minor agent should be a subagent
    const subAgents = scenario.snapshot.sub_agents
    expect(subAgents.length).toBeGreaterThanOrEqual(1)
  })

  it('generates per-operation events from multiple agents', async () => {
    const { scenario } = await buildFullPipeline()

    expect(scenario.events.length).toBeGreaterThan(0)

    // Events should come from multiple agents
    const agentIds = new Set(scenario.events.map(e => e.agent_id))
    expect(agentIds.size).toBeGreaterThan(1)
  })

  it('events reference valid buildings', async () => {
    const { scenario } = await buildFullPipeline()

    const buildingIds = new Set(scenario.snapshot.buildings.map(b => b.id))
    for (const event of scenario.events) {
      if (event.target?.building_id) {
        expect(buildingIds.has(event.target.building_id)).toBe(true)
      }
    }
  })

  it('produces no NaN or Infinity in output', async () => {
    const { scenario } = await buildFullPipeline()

    const json = JSON.stringify(scenario)
    expect(json).not.toContain('NaN')
    expect(json).not.toContain('Infinity')
  })

  it('handles queue-operation records without crashing', async () => {
    // Real queue-operations in this transcript are plain-text user messages
    // (not <task-notification> XML), so they don't produce task_complete ops.
    // This test verifies they're handled gracefully without errors.
    const records = await parseFixture()
    const cwm = canonicalize('test', records)

    // Should not throw, and operations should be valid
    expect(cwm.operations.length).toBeGreaterThan(0)
    for (const op of cwm.operations) {
      expect(op.id).toBeTruthy()
      expect(op.timestamp).toBeGreaterThan(0)
    }
  })

  it('agents have distinct positions on the map', async () => {
    const { scenario } = await buildFullPipeline()

    const positions = scenario.snapshot.agents.map(a =>
      `${a.position.local_x},${a.position.local_y}`,
    )
    const uniquePositions = new Set(positions)
    // With 19+ agents, we should have multiple distinct positions
    expect(uniquePositions.size).toBeGreaterThan(1)
  })
})
