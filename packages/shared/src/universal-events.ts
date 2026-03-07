export const UNIVERSAL_EVENTS_SCHEMA = 'universal-events' as const

export type UniversalEventsSchemaName = typeof UNIVERSAL_EVENTS_SCHEMA

export type UniversalActorKind = 'human' | 'agent' | 'subagent'

export type UniversalEventCategory =
  | 'conversation'
  | 'reasoning'
  | 'tool_call'
  | 'progress'
  | 'file_change'
  | 'system'
  | 'checkpoint'
  | 'background_task'
  | 'subagent'

export type UniversalEventStatus = 'ok' | 'error' | 'pending' | 'skipped'

export type UniversalInteractionType =
  | 'handoff'
  | 'assist'
  | 'block'
  | 'resolve'

export type UniversalIssueSeverity =
  | 'info'
  | 'warning'
  | 'error'
  | 'critical'

export type UniversalIssueStatus = 'open' | 'resolved' | 'dismissed'

export type UniversalDomainKind =
  | 'git_repo'
  | 'local_folder'
  | 'cloud_prefix'
  | 'docs_root'
  | 'unknown'

export type UniversalArtifactKind =
  | 'file'
  | 'directory'
  | 'command_output'
  | 'document'
  | 'url'

export type UniversalTargetKind = 'tool' | 'artifact' | 'task' | 'actor' | 'system'

export type UniversalLayoutUnits = 'tile' | 'chunk'

export type UniversalExportMode = 'private' | 'shareable'

export type UniversalToolOutputPolicy = 'hashed' | 'stripped' | 'none'

export interface UniversalTimeRange {
  start: string
  end: string
}

export interface UniversalImportFilters {
  project?: string
  sessionIds?: string[]
  dateRange?: {
    from: string
    to: string
  }
}

export interface UniversalImportMetadata {
  inputPaths: string[]
  filters?: UniversalImportFilters
  redactionPolicy: string
  exportMode?: UniversalExportMode
}

export interface UniversalSourceMetadata {
  cwdHints?: string[]
  gitBranchHints?: string[]
  gitRemoteHints?: string[]
  claudeVersion?: string
  [key: string]: unknown
}

export interface UniversalRun {
  id: string
  source: string
  createdAt: string
  inputDigest: string
  initialFocusDomainId?: string
  timeRange: UniversalTimeRange
  import: UniversalImportMetadata
  sourceMetadata?: UniversalSourceMetadata
}

export interface UniversalPresentation {
  labels?: {
    domain?: string
    district?: string
  }
}

export interface UniversalWorld {
  id: string
  name: string
}

export interface UniversalDomain {
  id: string
  name: string
  root: string
  kind: UniversalDomainKind
  confidence: number
  gitRemote?: string | null
  gitBranch?: string | null
}

export interface UniversalDistrict {
  id: string
  domainId: string
  name: string
  pathPrefix: string
  confidence: number
}

export interface UniversalArtifact {
  id: string
  domainId: string
  districtId: string
  kind: UniversalArtifactKind
  ref: string
}

export interface UniversalDomainPosition {
  domainId: string
  x: number
  y: number
  radius?: number
}

export interface UniversalTopologyLayout {
  algorithm: string
  units: UniversalLayoutUnits
  domainPositions?: UniversalDomainPosition[]
}

export interface UniversalTopology {
  world: UniversalWorld
  domains: UniversalDomain[]
  districts: UniversalDistrict[]
  artifacts: UniversalArtifact[]
  layout?: UniversalTopologyLayout
}

export interface UniversalActor {
  id: string
  kind: UniversalActorKind
  name: string
  parentActorId?: string
  sourceActorRef?: string
  sessionRef?: string
}

export interface UniversalEventTarget {
  kind: UniversalTargetKind
  id?: string
  name?: string
  ref?: string
}

export interface UniversalEventRawRef {
  path: string
  line: number
}

export interface UniversalEvent {
  id: string
  seqGlobal: number
  actorSeq: number
  ts: string
  actorId: string
  category: UniversalEventCategory
  action: string
  status: UniversalEventStatus
  target?: UniversalEventTarget | null
  context?: Record<string, unknown> | null
  correlationId?: string | null
  dedupeKey: string
  parentEventId?: string | null
  rawRef?: UniversalEventRawRef
  redacted: boolean
}

export interface UniversalInteraction {
  id: string
  type: UniversalInteractionType
  fromActorId: string
  toActorId: string
  eventId?: string
  reason?: string
  fromDomainId?: string
  toDomainId?: string
}

export interface UniversalIssue {
  id: string
  severity: UniversalIssueSeverity
  status: UniversalIssueStatus
  summary: string
  linkedEventIds: string[]
  linkedActorIds?: string[]
  domainId?: string
  districtId?: string
}

export interface UniversalPrivacyRedactions {
  thinkingContent: boolean
  toolOutputContent: UniversalToolOutputPolicy
  secretPatternsApplied: boolean
  redactedEventCount?: number
  redactedFieldCount?: number
  absolutePathsRedacted?: boolean
  actorNamesPseudonymized?: boolean
  hashAlgorithm?: string
  hashSalted?: boolean
}

export interface UniversalPrivacy {
  policy: string
  redactions: UniversalPrivacyRedactions
}

export interface UniversalEventsPackage {
  schema: UniversalEventsSchemaName
  schemaVersion: number
  run: UniversalRun
  presentation?: UniversalPresentation
  topology: UniversalTopology
  actors: UniversalActor[]
  events: UniversalEvent[]
  interactions: UniversalInteraction[]
  issues: UniversalIssue[]
  privacy: UniversalPrivacy
}
