import type { ScenarioData, UniversalEventsPackage } from '@multiverse/shared'

export interface ClaudeDateRange {
  from: string
  to: string
}

export interface ClaudeSessionDiscoveryOptions {
  projectFilter?: string
  sessionFilter?: string[]
  dateRange?: ClaudeDateRange
  basePath?: string
}

export interface ClaudeSessionFile {
  path: string
  sizeBytes: number
  estimatedEvents?: number
}

export interface ClaudeSessionManifest {
  project: string
  sessionId: string
  mainSessionFiles: ClaudeSessionFile[]
  subagentFiles: ClaudeSessionFile[]
}

export interface ConvertClaudeLogsOptions {
  discovery: ClaudeSessionDiscoveryOptions
  redactionPolicy?: 'default-safe' | 'full-content'
  exportMode?: 'private' | 'shareable'
}

export interface ConvertClaudeLogsResult {
  manifest: ClaudeSessionManifest[]
  package: UniversalEventsPackage
}

export interface ProjectUniversalEventsResult {
  scenario: ScenarioData
}
