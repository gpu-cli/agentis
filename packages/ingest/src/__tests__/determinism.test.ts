import { strict as assert } from 'node:assert'

import type { UniversalEventsPackage } from '@multiverse/shared'

import { computeInitialFocusDomainId } from '../topology/focus'

function fixture(): UniversalEventsPackage {
  return {
    schema: 'universal-events',
    schemaVersion: 1,
    run: {
      id: 'run_fixture',
      source: 'claude_code',
      createdAt: '2026-01-01T00:00:00.000Z',
      inputDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      timeRange: {
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-01T00:01:00.000Z',
      },
      import: {
        inputPaths: ['/workspace/alpha/session.jsonl'],
        redactionPolicy: 'default-safe',
        exportMode: 'shareable',
      },
    },
    topology: {
      world: {
        id: 'world_workspace',
        name: 'Workspace',
      },
      domains: [
        {
          id: 'dom_a',
          name: 'alpha',
          root: '/workspace/alpha',
          kind: 'git_repo',
          confidence: 0.9,
          gitRemote: null,
          gitBranch: null,
        },
        {
          id: 'dom_b',
          name: 'beta',
          root: '/workspace/beta',
          kind: 'git_repo',
          confidence: 0.8,
          gitRemote: null,
          gitBranch: null,
        },
      ],
      districts: [],
      artifacts: [],
    },
    actors: [{ id: 'actor_main', kind: 'agent', name: 'main' }],
    events: [
      {
        id: 'evt_1',
        seqGlobal: 1,
        actorSeq: 1,
        ts: '2026-01-01T00:00:10.000Z',
        actorId: 'actor_main',
        category: 'file_change',
        action: 'edit',
        status: 'ok',
        context: { domainId: 'dom_a' },
        dedupeKey: 'ue:sha1:one',
        redacted: false,
      },
      {
        id: 'evt_2',
        seqGlobal: 2,
        actorSeq: 2,
        ts: '2026-01-01T00:00:20.000Z',
        actorId: 'actor_main',
        category: 'conversation',
        action: 'message',
        status: 'ok',
        context: { domainId: 'dom_b' },
        dedupeKey: 'ue:sha1:two',
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
}

export function runDeterminismSmokeTest(): void {
  const first = computeInitialFocusDomainId(fixture())
  const second = computeInitialFocusDomainId(fixture())
  assert.equal(first, second, 'focus algorithm should be deterministic')
}
