import type { UniversalArtifact } from '@multiverse/shared'
import { createHash } from 'node:crypto'

function artifactId(domainId: string, ref: string): string {
  const digest = createHash('sha256')
    .update(`${domainId}:${ref}`)
    .digest('hex')
    .slice(0, 12)
  return `art_${digest}`
}

export function registerArtifacts(refs: string[]): UniversalArtifact[] {
  const normalized = [...new Set(refs)].filter((ref) => ref.length > 0)
  return normalized.map((ref) => ({
    id: artifactId('unassigned', ref),
    domainId: 'unassigned',
    districtId: 'unassigned',
    kind: ref.includes('://') ? 'url' : 'file',
    ref,
  }))
}
