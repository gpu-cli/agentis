import type { UniversalDomain } from '@multiverse/shared'
import { createHash } from 'node:crypto'
import { basename } from 'node:path'

function domainIdFromRoot(root: string): string {
  const digest = createHash('sha256').update(root).digest('hex').slice(0, 12)
  return `dom_${digest}`
}

function normalizeRoot(inputPath: string): string {
  const normalized = inputPath.replace(/\\/gu, '/')
  const parts = normalized.split('/').filter((segment) => segment.length > 0)
  if (parts.length >= 2) {
    return `/${parts.slice(0, 2).join('/')}`
  }
  if (parts.length === 1) {
    return `/${parts[0]}`
  }
  return '/workspace'
}

export function inferDomains(inputPaths: string[]): UniversalDomain[] {
  if (inputPaths.length === 0) {
    return [
      {
        id: domainIdFromRoot('/workspace'),
        name: 'workspace',
        root: '/workspace',
        kind: 'unknown',
        confidence: 0.2,
        gitRemote: null,
        gitBranch: null,
      },
    ]
  }

  const roots = [...new Set(inputPaths.map(normalizeRoot))]
  return roots
    .map((root) => ({
      id: domainIdFromRoot(root),
      name: basename(root) || 'workspace',
      root,
      kind: 'local_folder' as const,
      confidence: 0.7,
      gitRemote: null,
      gitBranch: null,
    }))
    .sort((a, b) => a.root.localeCompare(b.root))
}
