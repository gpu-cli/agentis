// ============================================================================
// Browser-safe topology inference (no node:crypto, no node:fs)
// ============================================================================

import type {
  UniversalArtifact,
  UniversalDistrict,
  UniversalDomain,
  UniversalTopologyLayout,
} from '@multiverse/shared'
import { deterministicId } from './hash'
import type { BrowserParsedRecord } from './parser'
import { getRecordBlocks, getProgressNestedBlocks } from './parser'

// ---------------------------------------------------------------------------
// ID generators
// ---------------------------------------------------------------------------

function domainIdFromRoot(root: string): string {
  return deterministicId('dom', root)
}

function districtIdFrom(domainId: string, pathPrefix: string): string {
  return deterministicId('dist', `${domainId}:${pathPrefix}`)
}

function artifactIdFrom(domainId: string, ref: string): string {
  return deterministicId('art', `${domainId}:artifact:${ref}`)
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+/u, '')
    .replace(/-+$/u, '') || 'project'
}

/** Extract all `cwd` values from transcript records */
export function extractCwdHints(records: BrowserParsedRecord[]): string[] {
  const cwds = new Set<string>()
  for (const item of records) {
    const cwd = item.record.cwd
    if (typeof cwd === 'string' && cwd.length > 0) {
      cwds.add(cwd.replace(/\\/gu, '/'))
    }
  }
  return [...cwds]
}

/** Extract file path from a tool_use input block (checks all common key names) */
function extractPathsFromToolInput(input: Record<string, unknown>, paths: Set<string>): void {
  // camelCase (legacy) and snake_case (Claude Code nested progress)
  for (const key of ['filePath', 'file_path', 'path']) {
    const val = input[key]
    if (typeof val === 'string' && val.length > 0) {
      paths.add(val.replace(/\\/gu, '/'))
    }
  }

  // Extract file paths from bash commands like: `cat /path/to/file`, `vim /path/to/file`
  if (typeof input.command === 'string') {
    const cmdPaths = extractPathsFromCommand(input.command)
    for (const p of cmdPaths) paths.add(p)
  }
}

/** Best-effort extraction of file paths from shell commands */
function extractPathsFromCommand(command: string): string[] {
  const paths: string[] = []
  // Match absolute paths in command strings
  const absPathPattern = /(?:^|\s)(\/[^\s;|&><"']+\.[a-zA-Z]{1,10})/gu
  let match: RegExpExecArray | null = null
  while ((match = absPathPattern.exec(command)) !== null) {
    if (match[1]) paths.push(match[1].replace(/\\/gu, '/'))
  }
  return paths
}

/**
 * Classify whether a file path is a "planning" path that should be excluded
 * from the core repo map. Planning paths include:
 * - .claude/ directory (agent planning files)
 * - Home directory paths outside repo root
 * - /tmp/ and /private/tmp/ paths (task scratch files)
 * - AGENTS.md, CLAUDE.md files (agent instruction files)
 */
function isPlanningOrExternalPath(filePath: string, repoRoots: string[]): boolean {
  const normalized = filePath.replace(/\\/gu, '/')

  // Check if path is under .claude/ directory
  if (/(?:^|\/)\.claude\//u.test(normalized)) return true

  // Check for AGENTS.md / CLAUDE.md at any level
  if (/(?:^|\/)(?:AGENTS|CLAUDE)\.md$/u.test(normalized)) return true

  // Check for /tmp/ or /private/tmp/ paths
  if (/^\/(?:private\/)?tmp\//u.test(normalized)) return true

  // Check for home directory paths that aren't under any repo root
  if (/^\/(?:Users|home)\//u.test(normalized)) {
    const isUnderRepo = repoRoots.some((root) => normalized.startsWith(`${root}/`))
    if (!isUnderRepo) return true
  }

  return false
}

/** Extract file paths from tool_use inputs (top-level + nested progress blocks) */
function extractFilePathsFromToolInputs(records: BrowserParsedRecord[]): string[] {
  const paths = new Set<string>()
  for (const item of records) {
    // Top-level blocks (assistant/user records)
    const topBlocks = getRecordBlocks(item.record)
    for (const block of topBlocks) {
      if (typeof block.type !== 'string' || block.type !== 'tool_use') continue
      const input = block.input as Record<string, unknown> | undefined
      if (input) extractPathsFromToolInput(input, paths)
    }

    // Nested blocks (progress records with data.message.message.content)
    if (item.record.type === 'progress') {
      const { blocks: nestedBlocks } = getProgressNestedBlocks(item.record)
      for (const block of nestedBlocks) {
        if (typeof block.type !== 'string' || block.type !== 'tool_use') continue
        const input = block.input as Record<string, unknown> | undefined
        if (input) extractPathsFromToolInput(input, paths)
      }
    }
  }
  return [...paths]
}

/** Extract file paths from tool_result content (git diff --stat, etc.) */
function extractFilePathsFromToolResults(records: BrowserParsedRecord[], repoRoot: string): string[] {
  const paths = new Set<string>()
  const diffStatPattern = /^\s+(\S+)\s+\|\s+\d+/u

  for (const item of records) {
    const blocks = getRecordBlocks(item.record)
    for (const block of blocks) {
      if (typeof block.type !== 'string' || block.type !== 'tool_result') continue
      const content = typeof block.content === 'string' ? block.content : ''
      if (!content) continue
      for (const line of content.split('\n')) {
        const match = diffStatPattern.exec(line)
        if (match?.[1]) {
          const filePath = match[1]
          if (filePath.includes('.') || filePath.includes('/')) {
            const fullPath = filePath.startsWith('/') ? filePath : `${repoRoot}/${filePath}`
            paths.add(fullPath.replace(/\\/gu, '/'))
          }
        }
      }
    }
  }
  return [...paths]
}

/** Derive repo root(s) from cwd hints */
function deriveRepoRoots(cwdHints: string[]): string[] {
  if (cwdHints.length === 0) return []
  const normalized = cwdHints.map((cwd) => cwd.replace(/\/+$/u, ''))
  const sorted = [...new Set(normalized)].sort((a, b) => a.length - b.length)
  const roots: string[] = []
  for (const cwd of sorted) {
    const isSubDir = roots.some((root) => cwd.startsWith(`${root}/`))
    if (!isSubDir) roots.push(cwd)
  }
  return roots
}

/** Classify file path under a repo root, returning relative path */
function classifyFileUnderRoot(filePath: string, roots: string[]): { root: string; relative: string } | null {
  const normalized = filePath.replace(/\\/gu, '/')
  let bestRoot: string | null = null
  let bestLength = 0
  for (const root of roots) {
    if (normalized.startsWith(`${root}/`) && root.length > bestLength) {
      bestRoot = root
      bestLength = root.length
    }
  }
  if (!bestRoot) return null
  return { root: bestRoot, relative: normalized.slice(bestRoot.length + 1) }
}

/** District path prefix from relative file path (first 1-2 dir segments) */
function districtPrefixFromRelative(relativePath: string): string {
  const parts = relativePath.split('/').filter((s) => s.length > 0)
  if (parts.length <= 1) return ''
  return `${parts.slice(0, Math.min(2, parts.length - 1)).join('/')}/`
}

// ---------------------------------------------------------------------------
// Main topology extraction
// ---------------------------------------------------------------------------

export interface ExtractedTopology {
  domains: UniversalDomain[]
  districts: UniversalDistrict[]
  artifacts: UniversalArtifact[]
  layout: UniversalTopologyLayout
  primaryDomainId: string
}

/**
 * Build full topology (domains/districts/artifacts) from transcript records.
 * One island per repository root. Districts are subdivisions within.
 */
export function extractTopology(
  projectName: string,
  records: BrowserParsedRecord[],
): ExtractedTopology {
  const cwdHints = extractCwdHints(records)

  let gitBranch: string | null = null
  const gitRemote: string | null = null
  for (const item of records) {
    if (typeof item.record.gitBranch === 'string' && item.record.gitBranch.length > 0) {
      gitBranch = item.record.gitBranch
      break
    }
  }

  const repoRoots = deriveRepoRoots(cwdHints)
  if (repoRoots.length === 0) {
    repoRoots.push(`/workspace/${slugify(projectName || 'project')}`)
  }

  const toolInputPaths = extractFilePathsFromToolInputs(records)
  const toolResultPaths = extractFilePathsFromToolResults(records, repoRoots[0]!)
  const allFilePaths = [...new Set([...toolInputPaths, ...toolResultPaths])]
    .filter((p) => !isPlanningOrExternalPath(p, repoRoots))

  // Build domains
  const domains: UniversalDomain[] = repoRoots.map((root) => ({
    id: domainIdFromRoot(root),
    name: root.split('/').pop() || 'workspace',
    root,
    kind: gitBranch ? 'git_repo' as const : 'local_folder' as const,
    confidence: cwdHints.length > 0 ? 0.95 : 0.7,
    gitRemote,
    gitBranch,
  }))

  const primaryDomainId = domains[0]!.id

  // Classify files under domains
  const domainFiles = new Map<string, string[]>()
  for (const domain of domains) domainFiles.set(domain.id, [])

  for (const filePath of allFilePaths) {
    const classification = classifyFileUnderRoot(filePath, repoRoots)
    if (classification) {
      const domainId = domainIdFromRoot(classification.root)
      domainFiles.get(domainId)?.push(classification.relative)
    }
  }

  // Assign relative paths to primary domain
  for (const filePath of allFilePaths) {
    if (!filePath.startsWith('/')) {
      const existing = domainFiles.get(primaryDomainId)
      if (existing && !existing.includes(filePath)) existing.push(filePath)
    }
  }

  // Build districts
  const districts: UniversalDistrict[] = []
  for (const domain of domains) {
    const files = domainFiles.get(domain.id) ?? []
    const prefixes = [...new Set(files.map(districtPrefixFromRelative))]

    // Derive a readable name for the root district based on the domain name
    const rootDistrictName = domain.name || 'Workspace'

    if (prefixes.length === 0) {
      districts.push({
        id: districtIdFrom(domain.id, ''),
        domainId: domain.id,
        name: rootDistrictName,
        pathPrefix: '',
        confidence: 0.5,
      })
    } else {
      for (const prefix of prefixes) {
        districts.push({
          id: districtIdFrom(domain.id, prefix),
          domainId: domain.id,
          name: prefix.length > 0 ? prefix.replace(/\/$/u, '') : rootDistrictName,
          pathPrefix: prefix,
          confidence: 0.75,
        })
      }
    }
  }

  // Build artifacts
  const artifacts: UniversalArtifact[] = []
  const seenArtifacts = new Set<string>()

  for (const domain of domains) {
    const files = domainFiles.get(domain.id) ?? []
    for (const relativePath of files) {
      const key = `${domain.id}:${relativePath}`
      if (seenArtifacts.has(key)) continue
      seenArtifacts.add(key)

      const prefix = districtPrefixFromRelative(relativePath)
      artifacts.push({
        id: artifactIdFrom(domain.id, relativePath),
        domainId: domain.id,
        districtId: districtIdFrom(domain.id, prefix),
        kind: 'file',
        ref: relativePath,
      })
    }
  }

  // Layout
  const layout: UniversalTopologyLayout = {
    algorithm: domains.length === 1 ? 'single-domain-focus' : 'multi-domain-row',
    units: 'tile',
    domainPositions: domains.map((domain, index) => ({
      domainId: domain.id,
      x: index * 300,
      y: 0,
      radius: 120,
    })),
  }

  return { domains, districts, artifacts, layout, primaryDomainId }
}
