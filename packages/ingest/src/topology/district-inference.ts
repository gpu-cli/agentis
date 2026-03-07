import type { UniversalDistrict } from '@multiverse/shared'
import { createHash } from 'node:crypto'

function districtId(domainId: string, pathPrefix: string): string {
  const digest = createHash('sha256')
    .update(`${domainId}:${pathPrefix}`)
    .digest('hex')
    .slice(0, 12)
  return `dist_${digest}`
}

function prefixFromRef(ref: string): string {
  const normalized = ref.replace(/\\/gu, '/')
  const parts = normalized.split('/').filter((segment) => segment.length > 0)
  if (parts.length <= 1) {
    return ''
  }
  return `${parts.slice(0, Math.min(2, parts.length - 1)).join('/')}/`
}

export function inferDistricts(domainId: string, artifacts: string[]): UniversalDistrict[] {
  const prefixes = [...new Set(artifacts.map(prefixFromRef))]
  if (prefixes.length === 0) {
    return [
      {
        id: districtId(domainId, ''),
        domainId,
        name: 'root',
        pathPrefix: '',
        confidence: 0.5,
      },
    ]
  }

  return prefixes
    .map((pathPrefix) => ({
      id: districtId(domainId, pathPrefix),
      domainId,
      name: pathPrefix.length > 0 ? pathPrefix.replace(/\/$/u, '') : 'root',
      pathPrefix,
      confidence: 0.75,
    }))
    .sort((a, b) => a.pathPrefix.localeCompare(b.pathPrefix))
}
