import type { ClaudeSessionDiscoveryOptions, ClaudeSessionManifest } from '../types'
import { basename, join, sep } from 'node:path'
import { homedir } from 'node:os'
import { type Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'

interface SessionAccumulator {
  project: string
  sessionId: string
  mainSessionFiles: ClaudeSessionManifest['mainSessionFiles']
  subagentFiles: ClaudeSessionManifest['subagentFiles']
}

function estimateEventCount(sizeBytes: number): number {
  const assumedBytesPerLine = 240
  return Math.max(1, Math.round(sizeBytes / assumedBytesPerLine))
}

function extractSessionId(filePath: string): string {
  const normalized = filePath.split(/[\\/]+/u)
  const subagentsIndex = normalized.lastIndexOf('subagents')
  if (subagentsIndex > 0) {
    return normalized[subagentsIndex - 1] ?? basename(filePath, '.jsonl')
  }
  return basename(filePath, '.jsonl')
}

function isSubagentPath(filePath: string): boolean {
  return filePath.includes(`${sep}subagents${sep}`)
}

async function collectJsonlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, encoding: 'utf8' })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectJsonlFiles(fullPath)))
      continue
    }

    if (entry.isFile() && fullPath.endsWith('.jsonl')) {
      files.push(fullPath)
    }
  }

  return files
}

export async function discoverClaudeSessions(
  options: ClaudeSessionDiscoveryOptions,
): Promise<ClaudeSessionManifest[]> {
  const basePath = options.basePath ?? join(homedir(), '.claude', 'projects')
  let projectEntries: Dirent[]
  try {
    projectEntries = await readdir(basePath, { withFileTypes: true, encoding: 'utf8' })
  } catch {
    return []
  }

  const projectDirs = projectEntries
    .filter((entry: Dirent) => entry.isDirectory())
    .map((entry: Dirent) => entry.name)
    .filter((name: string) => {
      if (!options.projectFilter) {
        return true
      }
      return name.toLowerCase().includes(options.projectFilter.toLowerCase())
    })

  const sessions = new Map<string, SessionAccumulator>()

  for (const project of projectDirs) {
    const projectRoot = join(basePath, project)
    const jsonlFiles = await collectJsonlFiles(projectRoot)

    for (const filePath of jsonlFiles) {
      const fileStat = await stat(filePath)
      if (options.dateRange) {
        const from = Date.parse(options.dateRange.from)
        const to = Date.parse(options.dateRange.to)
        if (!Number.isNaN(from) && fileStat.mtimeMs < from) {
          continue
        }
        if (!Number.isNaN(to) && fileStat.mtimeMs > to) {
          continue
        }
      }

      const sessionId = extractSessionId(filePath)
      if (options.sessionFilter && !options.sessionFilter.includes(sessionId)) {
        continue
      }

      const key = `${project}:${sessionId}`
      const existing = sessions.get(key)
      const accumulator: SessionAccumulator =
        existing ?? {
          project,
          sessionId,
          mainSessionFiles: [],
          subagentFiles: [],
        }

      const record = {
        path: filePath,
        sizeBytes: fileStat.size,
        estimatedEvents: estimateEventCount(fileStat.size),
      }

      if (isSubagentPath(filePath)) {
        accumulator.subagentFiles.push(record)
      } else {
        accumulator.mainSessionFiles.push(record)
      }

      sessions.set(key, accumulator)
    }
  }

  return [...sessions.values()]
    .map((session) => ({
      project: session.project,
      sessionId: session.sessionId,
      mainSessionFiles: session.mainSessionFiles.sort((a, b) => a.path.localeCompare(b.path)),
      subagentFiles: session.subagentFiles.sort((a, b) => a.path.localeCompare(b.path)),
    }))
    .sort((a, b) => {
      const projectCmp = a.project.localeCompare(b.project)
      if (projectCmp !== 0) {
        return projectCmp
      }
      return a.sessionId.localeCompare(b.sessionId)
    })
}
