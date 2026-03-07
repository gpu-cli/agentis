import { strict as assert } from 'node:assert'

import { inferDistricts } from '../topology/district-inference'
import { inferDomains } from '../topology/domain-inference'

export function runTopologySmokeTest(): void {
  const domains = inferDomains([
    '/workspace/alpha/src/main.ts',
    '/workspace/beta/docs/readme.md',
  ])
  assert.equal(domains.length, 2, 'expected two inferred domains')

  const districts = inferDistricts(domains[0].id, ['src/main.ts', 'src/utils/file.ts'])
  assert.ok(districts.length >= 1, 'expected at least one district')
  assert.ok(districts[0].id.startsWith('dist_'), 'district id should be deterministic')
}
