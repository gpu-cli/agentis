// ============================================================================
// Transcript Import Screen — Upload flow for transcript mode
// Supports Auto Import (session discovery) and Manual Upload (Files/Zip)
// via top-level Radix Tabs. Modal body scrollable via ShadCN ScrollArea.
// ============================================================================

import { useMemo, useRef, useState, useCallback, type ChangeEventHandler, type DragEvent } from 'react'
import { OnboardingBackdrop } from '../../components/OnboardingBackdrop'
import { useLocalSessions } from '../../hooks/useLocalSessions'
import { fetchSessionFiles, reconstructFiles } from './localSessionImport'
import { ScrollArea } from '@multiverse/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@multiverse/ui'
import type { LocalSessionSummary } from '@multiverse/shared/local-api-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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

type ImportMode = 'files' | 'zip'

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
  showPreview?: boolean
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
}: {
  sessions: LocalSessionSummary[]
  isLoading: boolean
  isLocalAvailable: boolean
  onLoadSession: (session: LocalSessionSummary) => void
  loadingSessionId: string | null
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
        <span className="text-xs text-gray-500 animate-pulse">Scanning transcripts...</span>
      </div>
    )
  }

  if (!isLocalAvailable) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="text-xs text-gray-500">
          Set <code className="text-gray-400 bg-gray-800 px-1 py-0.5 rounded text-[10px]">AGENTIS_LOCAL_MODE=true</code> to enable.
        </div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="text-center">
          <div className="text-xs text-gray-400">No sessions found in <code className="text-gray-500 bg-gray-800 px-1 py-0.5 rounded text-[10px]">~/.claude/projects/</code></div>
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
        <button
          onClick={() => onLoadSession(latestSession)}
          disabled={loadingSessionId !== null}
          className="w-full bg-green-800/40 hover:bg-green-800/60 border border-green-700/50 rounded-lg p-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-green-300 font-medium group-hover:text-green-200">
                {loadingSessionId === latestSession.sessionId ? 'Loading...' : 'Load latest'}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {formatProjectName(latestSession.project)}
                {' \u00b7 '}{formatRelativeTime(latestSession.updatedAt)}
                {' \u00b7 '}{formatBytes(latestSession.totalBytes)}
              </div>
            </div>
            <span className="text-green-400 text-sm group-hover:text-green-300">
              {loadingSessionId === latestSession.sessionId ? '\u23F3' : '\u25B6'}
            </span>
          </div>
        </button>
      )}

      {/* All sessions grouped by project */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">
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
                    <button
                      onClick={() => toggleProject(project)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-800/40 rounded transition-colors"
                    >
                      <span className="text-[10px] text-gray-500">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                      <span className="text-xs text-gray-300 font-medium truncate">{formatProjectName(project)}</span>
                      <span className="text-[10px] text-gray-600 ml-auto shrink-0">{projectSessions.length} session{projectSessions.length !== 1 ? 's' : ''}</span>
                    </button>
                  ) : null}

                  {/* Session list */}
                  {(isExpanded || grouped.size === 1) && (
                    <div className={`space-y-0.5 ${grouped.size > 1 ? 'ml-4' : ''}`}>
                      {projectSessions.map((session) => (
                        <button
                          key={session.sessionId}
                          onClick={() => onLoadSession(session)}
                          disabled={loadingSessionId !== null}
                          className="w-full bg-gray-950/40 hover:bg-gray-800/60 border border-gray-700/40 rounded px-3 py-2 text-left transition-colors disabled:opacity-50 text-xs flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <span className="text-gray-300 truncate block">{formatProjectName(session.project)}</span>
                            <span className="text-[10px] text-gray-500">
                              {formatRelativeTime(session.updatedAt)}
                              {' \u00b7 '}{formatBytes(session.totalBytes)}
                            </span>
                          </div>
                          <span className="text-gray-500 hover:text-gray-300 shrink-0">
                            {loadingSessionId === session.sessionId ? '\u23F3' : '\u25B6'}
                          </span>
                        </button>
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
    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
      <span>
        100% local — nothing leaves your machine.{' '}
        <a
          href="https://github.com/gpu-cli/agentis"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-300 underline underline-offset-2"
        >
          Source
        </a>
      </span>
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
}: TranscriptImportScreenProps) {
  const [projectName, setProjectName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importMode, setImportMode] = useState<ImportMode>('files')
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const { sessions, isLoading: sessionsLoading, isLocalAvailable } = useLocalSessions()

  // Default tab: auto import if local available, manual otherwise
  const defaultTab = isLocalAvailable || sessionsLoading ? 'auto' : 'manual'

  const handleLoadSession = useCallback(async (session: LocalSessionSummary) => {
    setLoadingSessionId(session.sessionId)
    setLocalError(null)
    try {
      const payload = await fetchSessionFiles(session.sessionId)
      const reconstructed = reconstructFiles(payload)
      setIsImporting(true)
      await onImport(payload.projectName, reconstructed)
      setIsImporting(false)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setLoadingSessionId(null)
    }
  }, [onImport])

  const fileNames = useMemo(() => files.map((file) => file.name), [files])
  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files])

  // ---- File acceptance per mode ----

  const isAcceptedFile = (file: File): boolean => {
    switch (importMode) {
      case 'files':
        return file.name.endsWith('.jsonl') || file.name.endsWith('.json')
      case 'zip':
        return file.name.endsWith('.zip')
    }
  }

  const inputAccept = (): string => {
    switch (importMode) {
      case 'files':
        return '.jsonl,.json,application/json'
      case 'zip':
        return '.zip,application/zip'
    }
  }

  // ---- Handlers ----

  const onDropZone = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(event.dataTransfer.files).filter(isAcceptedFile)
    if (droppedFiles.length > 0) {
      setFiles((current) => mergeFiles(current, droppedFiles))
    }
  }

  const onUpload: ChangeEventHandler<HTMLInputElement> = (event) => {
    const selected = Array.from(event.target.files ?? [])
    if (selected.length > 0) {
      setFiles((current) => mergeFiles(current, selected))
    }
    event.currentTarget.value = ''
  }

  const onFolderUpload: ChangeEventHandler<HTMLInputElement> = (event) => {
    const selected = Array.from(event.target.files ?? [])
    const filtered = selected.filter((f) => f.name.endsWith('.jsonl') || f.name.endsWith('.json'))
    if (filtered.length > 0) {
      setFiles((current) => mergeFiles(current, filtered))
    }
    event.currentTarget.value = ''
  }

  const startImport = async () => {
    if (projectName.trim().length === 0 || files.length === 0 || isImporting) {
      return
    }
    setIsImporting(true)
    await onImport(projectName.trim(), files)
    setIsImporting(false)
  }

  // ---- Drop zone text per mode ----

  const dropZoneText = (): { title: string; subtitle: string } => {
    switch (importMode) {
      case 'files':
        return { title: 'Drop transcript files here', subtitle: '.jsonl or .json' }
      case 'zip':
        return { title: 'Drop a .zip archive', subtitle: 'containing .jsonl or .json files' }
    }
  }

  const { title: dzTitle, subtitle: dzSubtitle } = dropZoneText()

  return (
    <div className="w-full h-full bg-gradient-to-b from-gray-950 to-gray-900 text-gray-100 flex items-center justify-center p-6 md:p-10 relative">
      <OnboardingBackdrop />
      <div className="relative z-10 w-full max-w-3xl bg-gray-900/80 border border-gray-700 rounded-xl shadow-2xl backdrop-blur-sm max-h-[90vh] flex flex-col">
        {/* Fixed header */}
        <div className="p-6 md:p-8 pb-0 shrink-0">
          <h1 className="font-pixel text-lg text-green-400 mb-1">Import Transcripts</h1>
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
              <TabsList className="w-full bg-gray-800/60 border border-gray-700/50 rounded-lg p-1 mb-4">
                <TabsTrigger
                  value="auto"
                  className="flex-1 text-xs data-[state=active]:bg-green-700 data-[state=active]:text-white data-[state=inactive]:text-gray-400 rounded-md px-3 py-1.5 transition-colors"
                >
                  Sessions{!sessionsLoading && sessions.length > 0 && (
                    <span className="ml-1.5 text-[10px] opacity-70">({sessions.length})</span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="manual"
                  className="flex-1 text-xs data-[state=active]:bg-green-700 data-[state=active]:text-white data-[state=inactive]:text-gray-400 rounded-md px-3 py-1.5 transition-colors"
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
                />
              </TabsContent>

              {/* ===== Manual Upload Tab ===== */}
              <TabsContent value="manual">
                <div className="space-y-4">
                  <label className="block">
                    <span className="block text-xs uppercase tracking-wide text-gray-400 mb-1">Project name</span>
                    <input
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                      placeholder="your-repo-name"
                      className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                  </label>

                  {/* Import mode sub-tabs (Files / Zip) */}
                  <div className="flex gap-1 mb-3">
                    <button
                      onClick={() => setImportMode('files')}
                      className={`px-3 py-1.5 text-xs rounded ${
                        importMode === 'files'
                          ? 'bg-green-700 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      Files
                    </button>
                    <button
                      onClick={() => setImportMode('zip')}
                      className={`px-3 py-1.5 text-xs rounded ${
                        importMode === 'zip'
                          ? 'bg-green-700 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      Zip
                    </button>
                  </div>

                  {/* Drop zone */}
                  <div
                    onDragOver={(event) => {
                      event.preventDefault()
                      setIsDragging(true)
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDropZone}
                    className={`border-2 border-dashed rounded-lg p-5 transition-colors ${
                      isDragging ? 'border-green-400 bg-green-950/20' : 'border-gray-700 bg-gray-950/40'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <div className="text-sm text-gray-200">{dzTitle}</div>
                        <div className="text-xs text-gray-500 mt-1">{dzSubtitle}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center justify-center px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs cursor-pointer">
                          {importMode === 'files' ? 'Choose Files' : 'Choose Zip'}
                          <input
                            type="file"
                            multiple={importMode !== 'zip'}
                            accept={inputAccept()}
                            className="hidden"
                            onChange={onUpload}
                          />
                        </label>
                        {importMode === 'files' && (
                          <label className="inline-flex items-center justify-center px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs cursor-pointer">
                            Choose Folder
                            <input
                              ref={folderInputRef}
                              type="file"
                              className="hidden"
                              onChange={onFolderUpload}
                              {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {fileNames.length > 0 ? (
                      <div className="mt-3 text-xs text-gray-300">
                        <div className="mb-1 flex items-center gap-2">
                          <span>{fileNames.length} file(s) selected</span>
                          <span className="text-gray-500">({formatBytes(totalSize)})</span>
                        </div>
                        <div className="max-h-24 overflow-auto space-y-1 pr-1">
                          {files.map((file) => (
                            <div key={file.name} className="font-mono text-[11px] text-gray-400 flex justify-between gap-2">
                              <span className="truncate">{file.name}</span>
                              <span className="text-gray-600 shrink-0">{formatBytes(file.size)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {errorMessage ? <div className="text-xs text-red-400">{errorMessage}</div> : null}

                  {/* Import progress */}
                  {isImporting && progress && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>Stage: {progress.stage}</span>
                        <span>{progress.percent}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all duration-300"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                      <div className="flex gap-4 text-[10px] text-gray-500">
                        {progress.bytesRead != null && <span>{formatBytes(progress.bytesRead)} read</span>}
                        {progress.fileCount != null && <span>{progress.fileCount} files</span>}
                        {progress.warningCount != null && progress.warningCount > 0 && (
                          <span className="text-yellow-500">{progress.warningCount} warnings</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Size cap warning dialog */}
                  {sizeWarning && (
                    <div className="mt-4 bg-yellow-900/30 border border-yellow-700/50 rounded p-4">
                      <div className="text-sm text-yellow-200 mb-3">
                        Projected uncompressed size: <strong>{formatBytes(sizeWarning.projectedSize)}</strong> (exceeds 20MB recommendation)
                      </div>
                      <div className="text-xs text-yellow-300/70 mb-3">
                        Large transcripts may be slow to process. Continue anyway?
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={sizeWarning.onContinue}
                          className="px-3 py-1.5 text-xs bg-yellow-700 hover:bg-yellow-600 rounded"
                        >
                          Continue
                        </button>
                        <button
                          onClick={sizeWarning.onCancel}
                          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Import warnings panel */}
                  {importWarnings && importWarnings.length > 0 && (
                    <div className="mt-4">
                      <div className="text-xs text-yellow-400 mb-1">Warnings ({importWarnings.length})</div>
                      <div className="max-h-32 overflow-auto bg-gray-950/60 border border-yellow-900/30 rounded p-2 space-y-1">
                        {importWarnings.map((w, i) => (
                          <div key={i} className="text-[10px] font-mono text-yellow-300/70">{w}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={startImport}
                      disabled={projectName.trim().length === 0 || files.length === 0 || isImporting}
                      className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {isImporting ? 'Processing...' : 'Visualize'}
                    </button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function mergeFiles(current: File[], incoming: File[]): File[] {
  const byName = new Map<string, File>()
  current.forEach((file) => {
    byName.set(file.name, file)
  })
  incoming.forEach((file) => {
    byName.set(file.name, file)
  })
  return [...byName.values()]
}
