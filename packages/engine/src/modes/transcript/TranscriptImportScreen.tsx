// ============================================================================
// Transcript Import Screen — Upload flow for transcript mode
// Supports Auto Import (session discovery) and Manual Upload (Files/Zip)
// via top-level Radix Tabs. Modal body scrollable via ShadCN ScrollArea.
// ============================================================================

import { useState, useCallback } from 'react'
import { OnboardingBackdrop } from '../../components/OnboardingBackdrop'
import { useLocalSessions } from '../../hooks/useLocalSessions'
import { fetchSessionFiles, reconstructFiles } from './localSessionImport'
import { Button, ScrollArea, Tabs, TabsList, TabsTrigger, TabsContent } from '@multiverse/ui'
import type { LocalSessionSummary } from '@multiverse/shared/local-api-types'
import { formatBytes } from '../../utils/formatting'
import { ManualUploadPanel } from './ManualUploadPanel'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(isoDate).toLocaleDateString()
}

/** Convert raw project path to a cleaner display name */
function formatProjectName(project: string): string {
  // -Users-angusbezzina-Development-hq → hq
  const segments = project.replace(/^-/, '').split('-')
  // Return last meaningful segment
  return segments[segments.length - 1] || project
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TranscriptImportScreenProps {
  onImport: (projectName: string, files: File[]) => Promise<boolean>
  errorMessage?: string | null
  warning?: string
  progress?: {
    stage: string
    percent: number
    bytesRead?: number
    fileCount?: number
    warningCount?: number
  } | null
  sizeWarning?: {
    projectedSize: number
    onContinue: () => void
    onCancel: () => void
  } | null
  importWarnings?: string[]
  /** Whether local session discovery is enabled (AGENTIS_LOCAL_MODE). Defaults to true. */
  isLocalEnabled?: boolean
  /** URL to link to when local mode is not available (e.g. "/install") */
  localInstallUrl?: string
}

// ---------------------------------------------------------------------------
// Auto-Detected Sessions Panel (for "Auto Import" tab)
// ---------------------------------------------------------------------------

/** Group sessions by project name */
function groupByProject(sessions: LocalSessionSummary[]): Map<string, LocalSessionSummary[]> {
  const groups = new Map<string, LocalSessionSummary[]>()
  for (const session of sessions) {
    const existing = groups.get(session.project)
    if (existing) {
      existing.push(session)
    } else {
      groups.set(session.project, [session])
    }
  }
  return groups
}

function AutoDetectedPanel({
  sessions,
  isLoading,
  isLocalAvailable,
  onLoadSession,
  loadingSessionId,
  localInstallUrl,
}: {
  sessions: LocalSessionSummary[]
  isLoading: boolean
  isLocalAvailable: boolean
  onLoadSession: (session: LocalSessionSummary) => void
  loadingSessionId: string | null
  localInstallUrl?: string
}) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  const toggleProject = useCallback((project: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(project)) {
        next.delete(project)
      } else {
        next.add(project)
      }
      return next
    })
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <span className="text-xs text-muted-foreground animate-pulse">Scanning transcripts...</span>
      </div>
    )
  }

  if (!isLocalAvailable) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="text-center space-y-3">
          <div className="text-xs text-muted-foreground">
            Local session discovery requires the Agentis app to be running.
          </div>
          {localInstallUrl ? (
            <a
              href={localInstallUrl}
              className="inline-block text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
            >
              View setup instructions
            </a>
          ) : (
            <div className="text-xs text-muted-foreground">
              Run the Agentis app locally to enable session discovery.
            </div>
          )}
        </div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="text-center">
          <div className="text-xs text-muted-foreground">No sessions found in <code className="text-muted-foreground bg-card px-1 py-0.5 rounded text-[10px]">~/.claude/projects/</code></div>
        </div>
      </div>
    )
  }

  const grouped = groupByProject(sessions)
  const latestSession = sessions[0]

  return (
    <div className="space-y-4">
      {/* Load latest CTA */}
      {latestSession && (
        <Button
          variant="default"
          size="sm"
          onClick={() => onLoadSession(latestSession)}
          disabled={loadingSessionId !== null}
          className="group h-auto w-full justify-start border border-green-700/50 bg-green-800/40 p-3 text-left transition-colors hover:bg-green-800/60 disabled:cursor-not-allowed"
        >
          <div className="flex w-full items-center justify-between">
            <div>
              <div className="text-sm text-green-300 font-medium group-hover:text-green-200">
                {loadingSessionId === latestSession.sessionId ? 'Loading...' : 'Load latest'}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {formatProjectName(latestSession.project)}
                {' \u00b7 '}{formatRelativeTime(latestSession.updatedAt)}
                {' \u00b7 '}{formatBytes(latestSession.totalBytes)}
              </div>
            </div>
            <span className="text-green-400 text-sm group-hover:text-green-300">
              {loadingSessionId === latestSession.sessionId ? '\u23F3' : '\u25B6'}
            </span>
          </div>
        </Button>
      )}

      {/* All sessions grouped by project */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </div>
        <ScrollArea viewportClassName="max-h-[45vh]">
          <div className="space-y-1 pr-2">
            {[...grouped.entries()].map(([project, projectSessions]) => {
              const isExpanded = expandedProjects.has(project) || grouped.size === 1
              return (
                <div key={project}>
                  {/* Project header — clickable to expand/collapse (only if multiple projects) */}
                  {grouped.size > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleProject(project)}
                      className="h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent/40"
                    >
                      <span className="text-[10px] text-muted-foreground">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                      <span className="text-xs text-card-foreground font-medium truncate">{formatProjectName(project)}</span>
                      <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">{projectSessions.length} session{projectSessions.length !== 1 ? 's' : ''}</span>
                    </Button>
                  ) : null}

                  {/* Session list */}
                  {(isExpanded || grouped.size === 1) && (
                    <div className={`space-y-0.5 ${grouped.size > 1 ? 'ml-4' : ''}`}>
                      {projectSessions.map((session) => (
                        <Button
                          variant="outline"
                          size="sm"
                          key={session.sessionId}
                          onClick={() => onLoadSession(session)}
                          disabled={loadingSessionId !== null}
                          className="h-auto w-full justify-start gap-2 border-border/40 bg-background/40 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/60 disabled:opacity-50"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-card-foreground truncate block">{formatProjectName(session.project)}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatRelativeTime(session.updatedAt)}
                              {' \u00b7 '}{formatBytes(session.totalBytes)}
                            </span>
                          </div>
                          <span className="text-muted-foreground hover:text-accent-foreground shrink-0">
                            {loadingSessionId === session.sessionId ? '\u23F3' : '\u25B6'}
                          </span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Privacy Disclosure — expandable trust indicator
// ---------------------------------------------------------------------------

function PrivacyDisclosure() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
      Choose between a local session or upload a Claude Code transcript file.
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TranscriptImportScreen({
  onImport,
  errorMessage,
  warning,
  progress,
  sizeWarning,
  importWarnings,
  isLocalEnabled = true,
  localInstallUrl,
}: TranscriptImportScreenProps) {
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const { sessions, isLoading: sessionsLoading, isLocalAvailable } = useLocalSessions({ enabled: isLocalEnabled })

  // Default tab: auto import if local available, manual otherwise
  const defaultTab = isLocalAvailable || sessionsLoading ? 'auto' : 'manual'

  const handleLoadSession = useCallback(async (session: LocalSessionSummary) => {
    setLoadingSessionId(session.sessionId)
    setLocalError(null)
    try {
      const payload = await fetchSessionFiles(session.sessionId)
      const reconstructed = reconstructFiles(payload)
      await onImport(payload.projectName, reconstructed)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setLoadingSessionId(null)
    }
  }, [onImport])

  return (
    <div className="w-full h-full bg-gradient-to-b from-background to-background text-foreground flex items-center justify-center p-6 md:p-10 relative">
      <OnboardingBackdrop />
      <div className="relative z-10 w-full max-w-3xl bg-surface-2/80 border border-border rounded-xl shadow-2xl backdrop-blur-sm max-h-[90vh] flex flex-col">
        {/* Fixed header */}
        <div className="p-6 pb-0 shrink-0">
          <h1 className="font-pixel text-lg text-primary mb-1">Import Transcripts</h1>
          <PrivacyDisclosure />
        </div>

        {/* Scrollable body */}
        <ScrollArea viewportClassName="max-h-[calc(90vh-8rem)]" className="flex-1 min-h-0">
          <div className="px-6 md:px-8 py-4">
            {/* Warning banner */}
            {warning && (
              <div className="mb-4 bg-yellow-900/30 border border-yellow-700/50 rounded px-3 py-2 text-xs text-yellow-200">
                {warning}
              </div>
            )}

            {/* Local session load error */}
            {localError && (
              <div className="mb-4 bg-red-900/30 border border-red-700/50 rounded px-3 py-2 text-xs text-red-300">
                {localError}
              </div>
            )}

            {/* ===== Tabs: Auto Import / Manual Upload ===== */}
            <Tabs defaultValue={defaultTab} className="w-full">
              <TabsList className="w-full bg-card/60 border border-border/50 rounded-lg p-1 mb-4">
                <TabsTrigger
                  value="auto"
                  className="flex-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground rounded-md px-3 py-1.5 transition-colors"
                >
                  Sessions{!sessionsLoading && sessions.length > 0 && (
                    <span className="ml-1.5 text-[10px] opacity-70">({sessions.length})</span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="manual"
                  className="flex-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground rounded-md px-3 py-1.5 transition-colors"
                >
                  Upload
                </TabsTrigger>
              </TabsList>

              {/* ===== Auto Import Tab ===== */}
              <TabsContent value="auto">
                <AutoDetectedPanel
                  sessions={sessions}
                  isLoading={sessionsLoading}
                  isLocalAvailable={isLocalAvailable}
                  onLoadSession={handleLoadSession}
                  loadingSessionId={loadingSessionId}
                  localInstallUrl={localInstallUrl}
                />
              </TabsContent>

              <ManualUploadPanel
                onImport={onImport}
                errorMessage={errorMessage}
                progress={progress}
                sizeWarning={sizeWarning}
                importWarnings={importWarnings}
              />
            </Tabs>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
