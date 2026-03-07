import { strict as assert } from 'node:assert'

import type { UniversalEventsPackage } from '@multiverse/shared'

import { applyPrivacyRedaction } from '../privacy/redact'

function fixture(): UniversalEventsPackage {
  return {
    schema: 'universal-events',
    schemaVersion: 1,
    run: {
      id: 'run_privacy',
      source: 'claude_code',
      createdAt: '2026-01-01T00:00:00.000Z',
      inputDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      timeRange: {
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-01T00:01:00.000Z',
      },
      import: {
        inputPaths: ['/Users/alice/project/session.jsonl'],
        redactionPolicy: 'default-safe',
        exportMode: 'shareable',
      },
    },
    topology: {
      world: { id: 'world', name: 'Workspace' },
      domains: [
        {
          id: 'dom_a',
          name: 'a',
          root: '/workspace/a',
          kind: 'local_folder',
          confidence: 0.9,
          gitRemote: null,
          gitBranch: null,
        },
      ],
      districts: [],
      artifacts: [],
    },
    actors: [{ id: 'actor_user', kind: 'human', name: 'Alice' }],
    events: [
      {
        id: 'evt_1',
        seqGlobal: 1,
        actorSeq: 1,
        ts: '2026-01-01T00:00:01.000Z',
        actorId: 'actor_user',
        category: 'reasoning',
        action: 'note',
        status: 'ok',
        context: { summary: 'secret sk_live_1234567890123456' },
        dedupeKey: 'ue:sha1:1',
        rawRef: { path: '/Users/alice/project/log.jsonl', line: 2 },
        redacted: false,
      },
      {
        id: 'evt_2',
        seqGlobal: 2,
        actorSeq: 2,
        ts: '2026-01-01T00:00:02.000Z',
        actorId: 'actor_user',
        category: 'tool_call',
        action: 'completed',
        status: 'ok',
        context: { output: 'token ghp_123456789012345678901234567890123456' },
        dedupeKey: 'ue:sha1:2',
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

export function runPrivacySmokeTest(): void {
  const redacted = applyPrivacyRedaction(fixture())

  assert.equal(redacted.actors[0].name, 'human-1')
  assert.equal(redacted.events[0].redacted, true)
  assert.equal(redacted.events[0].context?.summary, '[redacted]')
  assert.equal(typeof redacted.events[1].context?.resultHash, 'string')
  assert.ok((redacted.run.import.inputPaths[0] ?? '').startsWith('/workspace/'))
  assert.equal(redacted.privacy.redactions.toolOutputContent, 'hashed')
}
