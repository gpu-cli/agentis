// ============================================================================
// Browser Ingest Pipeline — Determinism + Correctness Smoke Tests
// ============================================================================

import { strict as assert } from 'node:assert'

import type { UniversalEventsPackage } from '@multiverse/shared'

import { deterministicId } from '../browser/hash'
import { getRecordTimestamp, getActorIdFromRecord, getRecordBlocks } from '../browser/parser'
import { extractTopology, extractCwdHints } from '../browser/topology'
import { scrubSecrets } from '../browser/privacy'
import { buildBootstrapScenario, projectToScenario } from '../browser/projector'

// ---------------------------------------------------------------------------
// Hash determinism
// ---------------------------------------------------------------------------

export function runHashDeterminismTest(): void {
  const id1 = deterministicId('dom', '/workspace/alpha')
  const id2 = deterministicId('dom', '/workspace/alpha')
  const id3 = deterministicId('dom', '/workspace/beta')

  assert.equal(id1, id2, 'identical inputs should produce identical IDs')
  assert.notEqual(id1, id3, 'different inputs should produce different IDs')
  assert.ok(id1.startsWith('dom_'), 'ID should start with prefix')
  assert.ok(id1.length > 4, 'ID should have content after prefix')
}

// ---------------------------------------------------------------------------
// Parser helpers
// ---------------------------------------------------------------------------

export function runParserHelpersTest(): void {
  // getRecordTimestamp
  assert.equal(
    getRecordTimestamp({ ts: '2026-01-01T00:00:00Z', type: 'assistant' }),
    '2026-01-01T00:00:00Z',
  )
  assert.equal(
    getRecordTimestamp({ timestamp: '2026-02-01T00:00:00Z', type: 'user' }),
    '2026-02-01T00:00:00Z',
  )
  assert.equal(
    getRecordTimestamp({ type: 'system' }),
    new Date(0).toISOString(),
  )

  // getActorIdFromRecord
  assert.equal(getActorIdFromRecord({ type: 'user' }), 'actor_user')
  assert.equal(getActorIdFromRecord({ type: 'assistant' }), 'actor_main')
  assert.equal(
    getActorIdFromRecord({ type: 'assistant', agentId: 'worker' }),
    'actor_agent_worker',
  )
  assert.equal(
    getActorIdFromRecord({ type: 'assistant', agentId: 'sub1', isSidechain: true }),
    'actor_sub_sub1',
  )

  // getRecordBlocks
  const blocks = getRecordBlocks({
    type: 'assistant',
    content: [{ type: 'text', text: 'hello' }, { type: 'thinking', thinking: '...' }],
  })
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0]?.type, 'text')

  // nested message.content format
  const nestedBlocks = getRecordBlocks({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'nested' }] },
  })
  assert.equal(nestedBlocks.length, 1)
}

// ---------------------------------------------------------------------------
// Topology inference
// ---------------------------------------------------------------------------

export function runTopologyInferenceTest(): void {
  const records = [
    {
      record: {
        type: 'assistant',
        cwd: '/Users/dev/myproject',
        content: [
          {
            type: 'tool_use',
            name: 'Read',
            input: { filePath: '/Users/dev/myproject/src/main.ts' },
          },
          {
            type: 'tool_use',
            name: 'Write',
            input: { filePath: '/Users/dev/myproject/src/utils/helpers.ts' },
          },
          {
            type: 'tool_use',
            name: 'Read',
            input: { filePath: '/Users/dev/myproject/tests/main.test.ts' },
          },
        ],
      },
      fileName: 'session.jsonl',
      line: 1,
    },
  ]

  const topology = extractTopology('myproject', records)

  // Should have exactly 1 domain
  assert.equal(topology.domains.length, 1, 'expected one domain')
  assert.equal(topology.domains[0]?.name, 'myproject')
  assert.equal(topology.domains[0]?.kind, 'local_folder')

  // Should have districts inferred from path prefixes
  assert.ok(topology.districts.length >= 1, 'expected at least one district')

  // Should have file artifacts
  assert.ok(topology.artifacts.length >= 1, 'expected at least one artifact')
  assert.ok(
    topology.artifacts.every((a) => a.kind === 'file'),
    'all artifacts should be files',
  )

  // Layout should exist
  assert.ok(topology.layout, 'layout should be defined')
  assert.equal(topology.layout.algorithm, 'single-domain-focus')

  // CWD hints
  const cwds = extractCwdHints(records)
  assert.equal(cwds.length, 1)
  assert.ok(cwds[0]?.includes('myproject'))

  // Determinism: same input -> same output
  const topology2 = extractTopology('myproject', records)
  assert.equal(topology.primaryDomainId, topology2.primaryDomainId)
  assert.equal(topology.domains[0]?.id, topology2.domains[0]?.id)
}

// ---------------------------------------------------------------------------
// Privacy / secret scrubbing
// ---------------------------------------------------------------------------

export function runPrivacyScrubTest(): void {
  // Generic key patterns
  assert.ok(
    scrubSecrets('my sk_live_1234567890123456 token').includes('[redacted-secret]'),
    'should scrub generic key',
  )

  // GitHub PAT
  assert.ok(
    scrubSecrets('token ghp_123456789012345678901234567890123456').includes('[redacted-secret]'),
    'should scrub GitHub PAT',
  )

  // JWT-like
  assert.ok(
    scrubSecrets('auth eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0NTY3ODkwIn0').includes('[redacted-secret]'),
    'should scrub JWT',
  )

  // Slack token
  assert.ok(
    scrubSecrets('slack xoxb-1234-5678-abcdef').includes('[redacted-secret]'),
    'should scrub Slack token',
  )

  // PEM key marker
  assert.ok(
    scrubSecrets('-----BEGIN RSA PRIVATE KEY-----').includes('[redacted-secret]'),
    'should scrub PEM key',
  )

  // Safe text should pass through
  assert.equal(
    scrubSecrets('just normal text here'),
    'just normal text here',
  )
}

// ---------------------------------------------------------------------------
// Projector — package → ScenarioData
// ---------------------------------------------------------------------------

function makeMinimalPackage(): UniversalEventsPackage {
  return {
    schema: 'universal-events',
    schemaVersion: 1,
    run: {
      id: 'run_test',
      source: 'claude_code',
      createdAt: '2026-01-01T00:00:00.000Z',
      inputDigest: 'sha256:aaaa',
      timeRange: {
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-01T00:01:00.000Z',
      },
      import: {
        inputPaths: ['/workspace/test/session.jsonl'],
        redactionPolicy: 'default-safe',
        exportMode: 'shareable',
      },
    },
    topology: {
      world: { id: 'world_test', name: 'Test Project' },
      domains: [
        {
          id: 'dom_test',
          name: 'test',
          root: '/workspace/test',
          kind: 'git_repo',
          confidence: 0.9,
          gitRemote: null,
          gitBranch: 'main',
        },
      ],
      districts: [
        {
          id: 'dist_src',
          domainId: 'dom_test',
          name: 'src',
          pathPrefix: 'src/',
          confidence: 0.75,
        },
      ],
      artifacts: [
        {
          id: 'art_main',
          domainId: 'dom_test',
          districtId: 'dist_src',
          kind: 'file',
          ref: 'src/main.ts',
        },
        {
          id: 'art_utils',
          domainId: 'dom_test',
          districtId: 'dist_src',
          kind: 'file',
          ref: 'src/utils.ts',
        },
      ],
    },
    actors: [
      { id: 'actor_main', kind: 'agent', name: 'main' },
      { id: 'actor_user', kind: 'human', name: 'user' },
    ],
    events: [
      {
        id: 'evt_000001',
        seqGlobal: 1,
        actorSeq: 1,
        ts: '2026-01-01T00:00:10.000Z',
        actorId: 'actor_main',
        category: 'tool_call',
        action: 'started',
        status: 'ok',
        target: { kind: 'tool', id: 'tool_1', name: 'Read' },
        context: { filePath: 'src/main.ts' },
        dedupeKey: 'ue:sha1:001',
        redacted: false,
      },
      {
        id: 'evt_000002',
        seqGlobal: 2,
        actorSeq: 2,
        ts: '2026-01-01T00:00:20.000Z',
        actorId: 'actor_main',
        category: 'conversation',
        action: 'message',
        status: 'ok',
        context: { summary: 'Reading the main file' },
        dedupeKey: 'ue:sha1:002',
        redacted: false,
      },
      {
        id: 'evt_000003',
        seqGlobal: 3,
        actorSeq: 3,
        ts: '2026-01-01T00:00:30.000Z',
        actorId: 'actor_main',
        category: 'tool_call',
        action: 'completed',
        status: 'error',
        target: { kind: 'tool', id: 'tool_2', name: 'Bash' },
        context: { resultHash: 'sha256:bbbb' },
        dedupeKey: 'ue:sha1:003',
        redacted: false,
      },
    ],
    interactions: [],
    issues: [
      {
        id: 'iss_001',
        severity: 'error',
        status: 'open',
        summary: 'tool_call:completed failed',
        linkedEventIds: ['evt_000003'],
        linkedActorIds: ['actor_main'],
        domainId: 'dom_test',
      },
    ],
    privacy: {
      policy: 'default-safe',
      redactions: {
        thinkingContent: true,
        toolOutputContent: 'hashed',
        secretPatternsApplied: true,
      },
    },
  }
}

export function runProjectorTest(): void {
  const pkg = makeMinimalPackage()

  // Direct projection (no normalization)
  const scenario = projectToScenario(pkg)
  assert.equal(scenario.name, 'run_test')
  assert.ok(scenario.snapshot.islands.length >= 1, 'should have at least one island')
  assert.ok(scenario.snapshot.districts.length >= 1, 'should have at least one district')
  assert.ok(scenario.snapshot.buildings.length >= 1, 'should have buildings from artifacts')
  assert.ok(scenario.snapshot.agents.length >= 1, 'should have at least one agent')
  assert.equal(scenario.events.length, 3, 'should project all 3 events')

  // Bootstrap projection (with normalization)
  const { scenario: bootstrapped, warnings } = buildBootstrapScenario(pkg)
  assert.ok(bootstrapped.snapshot.islands.length >= 1, 'bootstrap should have islands')
  assert.ok(bootstrapped.snapshot.districts.length >= 1, 'bootstrap should have districts')
  assert.ok(bootstrapped.snapshot.buildings.length >= 1, 'bootstrap should have buildings')
  assert.ok(bootstrapped.snapshot.agents.length >= 1, 'bootstrap should have agents')
  assert.ok(bootstrapped.snapshot.tiles.length >= 1, 'bootstrap should have tiles')

  // All positions should be valid integers
  for (const island of bootstrapped.snapshot.islands) {
    assert.ok(Number.isInteger(island.position.local_x), `island ${island.id} local_x should be int`)
    assert.ok(Number.isInteger(island.position.local_y), `island ${island.id} local_y should be int`)
    assert.ok(island.bounds.width >= 6, `island ${island.id} width should be >= 6`)
  }

  // Agent events should have correct types
  const toolEvents = bootstrapped.events.filter((e) => e.type === 'tool_use')
  assert.ok(toolEvents.length >= 1, 'should have tool_use events')
  const messageEvents = bootstrapped.events.filter((e) => e.type === 'message_send')
  assert.ok(messageEvents.length >= 1, 'should have message_send events')
  const errorEvents = bootstrapped.events.filter((e) => e.type === 'error_spawn')
  assert.ok(errorEvents.length >= 1, 'should have error_spawn events')

  // Determinism
  const { scenario: again } = buildBootstrapScenario(pkg)
  assert.equal(
    bootstrapped.snapshot.islands[0]?.id,
    again.snapshot.islands[0]?.id,
    'should be deterministic',
  )
  assert.equal(
    bootstrapped.snapshot.buildings.length,
    again.snapshot.buildings.length,
    'building count should be deterministic',
  )

  // Type check: no NaN/Infinity in snapshot
  const json = JSON.stringify(bootstrapped.snapshot)
  assert.ok(!json.includes('NaN'), 'snapshot should not contain NaN')
  assert.ok(!json.includes('Infinity'), 'snapshot should not contain Infinity')

  // Warnings array is valid (no assertion on count — just that it's an array)
  assert.ok(Array.isArray(warnings), 'warnings should be an array')
}

// ---------------------------------------------------------------------------
// Fallback synthesis
// ---------------------------------------------------------------------------

export function runFallbackSynthesisTest(): void {
  // Empty topology → should synthesize fallbacks instead of crashing
  const emptyPkg: UniversalEventsPackage = {
    schema: 'universal-events',
    schemaVersion: 1,
    run: {
      id: 'run_empty',
      source: 'claude_code',
      createdAt: '2026-01-01T00:00:00.000Z',
      inputDigest: 'sha256:empty',
      timeRange: {
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-01T00:00:01.000Z',
      },
      import: {
        inputPaths: [],
        redactionPolicy: 'default-safe',
      },
    },
    topology: {
      world: { id: 'world_empty', name: 'Empty' },
      domains: [],
      districts: [],
      artifacts: [],
    },
    actors: [],
    events: [
      {
        id: 'evt_1',
        seqGlobal: 1,
        actorSeq: 1,
        ts: '2026-01-01T00:00:00.000Z',
        actorId: 'actor_orphan',
        category: 'conversation',
        action: 'message',
        status: 'ok',
        dedupeKey: 'ue:sha1:orphan',
        redacted: false,
      },
    ],
    interactions: [],
    issues: [],
    privacy: {
      policy: 'default-safe',
      redactions: {
        thinkingContent: true,
        toolOutputContent: 'hashed',
        secretPatternsApplied: true,
      },
    },
  }

  const { scenario, warnings } = buildBootstrapScenario(emptyPkg)

  // Should have synthesized fallbacks
  assert.ok(scenario.snapshot.islands.length >= 1, 'should synthesize fallback island')
  assert.ok(scenario.snapshot.districts.length >= 1, 'should synthesize fallback district')
  assert.ok(scenario.snapshot.buildings.length >= 1, 'should synthesize fallback building')
  assert.ok(scenario.snapshot.agents.length >= 1, 'should synthesize fallback agent for orphan event')
  assert.ok(warnings.length > 0, 'should have warnings about synthesized entities')
}
