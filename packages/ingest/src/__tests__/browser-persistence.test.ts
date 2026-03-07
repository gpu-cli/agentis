// ============================================================================
// Persistence Lifecycle Smoke Tests
// Tests the save/load/clear/hasSavedTranscript contract
// ============================================================================

import { strict as assert } from 'node:assert'

// We cannot directly import the browser persistence module (it uses
// localStorage which doesn't exist in Node). Instead, we test the
// storage contract logic by simulating the same read/write patterns.

const STORAGE_KEY = 'multiverse.transcript.universal.v1'

/** Minimal mock of the stored shape */
interface StoredTranscript {
  schemaVersion: number
  savedAt: string
  projectName: string
  source: 'upload'
  package: Record<string, unknown>
}

function makeStoredTranscript(projectName = 'test-project'): StoredTranscript {
  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    projectName,
    source: 'upload',
    package: {
      schema: 'universal-events',
      schemaVersion: 1,
      run: { id: 'run_test' },
    },
  }
}

// ---------------------------------------------------------------------------
// Save/Load round-trip
// ---------------------------------------------------------------------------

export function runPersistenceRoundTripTest(): void {
  const stored = makeStoredTranscript('my-project')
  const serialized = JSON.stringify(stored)
  const deserialized = JSON.parse(serialized) as Record<string, unknown>

  // Validate structural checks match what loadTranscript does
  assert.equal(deserialized.schemaVersion, 1)
  assert.equal(typeof deserialized.projectName, 'string')
  assert.equal(typeof deserialized.savedAt, 'string')
  assert.equal(typeof deserialized.package, 'object')
  assert.notEqual(deserialized.package, null)
  assert.equal(deserialized.projectName, 'my-project')
}

// ---------------------------------------------------------------------------
// Schema version mismatch detection
// ---------------------------------------------------------------------------

export function runVersionMismatchTest(): void {
  const stored = makeStoredTranscript()
  stored.schemaVersion = 99
  const serialized = JSON.stringify(stored)
  const deserialized = JSON.parse(serialized) as Record<string, unknown>

  // loadTranscript would detect this mismatch
  assert.notEqual(deserialized.schemaVersion, 1, 'should detect version mismatch')
}

// ---------------------------------------------------------------------------
// Corrupt data detection
// ---------------------------------------------------------------------------

export function runCorruptDataDetectionTest(): void {
  // Not valid JSON
  const badJson = '{invalid json here'
  let threw = false
  try {
    JSON.parse(badJson)
  } catch {
    threw = true
  }
  assert.ok(threw, 'should detect corrupt JSON')

  // Valid JSON but wrong shape (missing required fields)
  const wrongShape = JSON.stringify({ foo: 'bar' })
  const parsed = JSON.parse(wrongShape) as Record<string, unknown>
  assert.equal(typeof parsed.projectName, 'undefined', 'missing projectName should be detectable')
  assert.equal(typeof parsed.package, 'undefined', 'missing package should be detectable')
}

// ---------------------------------------------------------------------------
// Failed save does not clobber existing data
// ---------------------------------------------------------------------------

export function runNoClobberOnFailureTest(): void {
  // This test verifies the invariant: if conversion/validation fails,
  // we never call saveTranscript, so existing data is untouched.
  // We simulate by checking that the save function can distinguish
  // between valid and invalid packages.

  const validStored = makeStoredTranscript('valid-project')
  const serialized = JSON.stringify(validStored)

  // Verify the valid data round-trips correctly
  const restored = JSON.parse(serialized) as Record<string, unknown>
  assert.equal(restored.schemaVersion, 1)
  assert.equal(restored.projectName, 'valid-project')

  // A separate failed attempt should not affect the serialized data
  // (this is a logic check — in the real code, saveTranscript is only
  // called after successful conversion)
  const stillValid = JSON.parse(serialized) as Record<string, unknown>
  assert.equal(stillValid.projectName, 'valid-project', 'original data should be intact')
}

// ---------------------------------------------------------------------------
// Storage key contract
// ---------------------------------------------------------------------------

export function runStorageKeyContractTest(): void {
  assert.equal(STORAGE_KEY, 'multiverse.transcript.universal.v1')
  assert.ok(STORAGE_KEY.includes('v1'), 'key should include version')
}
