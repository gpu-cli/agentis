// ============================================================================
// Transcript Import Screen — Upload flow for transcript mode
//
// Two-section layout:
// 1. Auto-detected sessions (when local mode is available)
// 2. Manual upload (Files / Folder / Zip) — always available as fallback
// ============================================================================

import { useCallback, useMemo, useState, type ChangeEventHandler, type DragEvent } from 'react'
import { OnboardingBackdrop } from '../../components/OnboardingBackdrop'
import { useLocalSessions } from '../../hooks/useLocalSessions'
import { fetchSessionFiles, reconstructFiles } from './localSessionImport'
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

/** Detect browser support for the webkitdirectory attribute */
const supportsFolder =
  typeof HTMLInputElement !== 'undefined' &&
  'webkitdirectory' in HTMLInputElement.prototype

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportMode = 'files' | 'folder' | 'zip'

interface TranscriptImportScreenProps {
  onImport: (projectName: string, files: File[]) => Promise<boolean>
  errorMessage?: string | null
  warning?: string
  /** Progress state from parent (worker pipeline) */
  progress?: {
    stage: string
    percent: number
    bytesRead?: number
    fileCount?: number
    warningCount?: number
  } | null
  /** Size cap exceeded — show continue/cancel dialog */
  sizeWarning?: {
    projectedSize: number
    onContinue: () => void
    onCancel: () => void
  } | null
  /** Parse warnings to display after import attempt */
  importWarnings?: string[]
  /** Whether to show a preview placeholder before final import */
  showPreview?: boolean
}

// ---------------------------------------------------------------------------
// Auto-Detected Sessions Panel
// ---------------------------------------------------------------------------

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
  // Don't render anything if local mode is not available and not loading
  if (!isLoading && !isLocalAvailable) return null

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
        <h2 className="text-xs uppercase tracking-wide text-gray-400">
          Auto-detected sessions
        </h2>
      </div>

      {isLoading && (
        <div className="bg-gray-950/40 border border-gray-700/50 rounded-lg p-4 text-center">
          <span className="text-xs text-gray-500 animate-pulse">
            Scanning for Claude Code transcripts...
          </span>
        </div>
      )}

      {!isLoading && isLocalAvailable && sessions.length === 0 && (
        <div className="bg-gray-950/40 border border-gray-700/50 rounded-lg p-4">
          <div className="text-xs text-gray-500 text-center">
            No sessions found in{' '}
            <code className="text-gray-400 bg-gray-800 px-1 py-0.5 rounded text-[10px]">
              ~/.claude/projects/
            </code>
          </div>
          <div className="text-[10px] text-gray-600 text-center mt-1">
            Run a Claude Code session first, then refresh this page.
          </div>
        </div>
      )}

      {!isLoading && sessions.length > 0 && (
        <div className="space-y-1.5">
          {/* Load Latest — prominent CTA for the newest session */}
          <button
            onClick={() => sessions[0] && onLoadSession(sessions[0])}
            disabled={loadingSessionId !== null}
            className="w-full bg-green-800/40 hover:bg-green-800/60 border border-green-700/50 rounded-lg p-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-green-300 font-medium group-hover:text-green-200">
                  {loadingSessionId === sessions[0]?.sessionId
                    ? 'Loading...'
                    : 'Load latest session'}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  <span className="text-green-400/70">{sessions[0]?.project}</span>
                  {' \u00b7 '}
                  {formatRelativeTime(sessions[0]?.updatedAt ?? '')}
                  {' \u00b7 '}
                  {sessions[0] && formatBytes(sessions[0].totalBytes)}
                  {sessions[0]?.hasSubagents ? ' \u00b7 has subagents' : ''}
                </div>
              </div>
              <span className="text-green-400 text-sm group-hover:text-green-300">
                {loadingSessionId === sessions[0]?.sessionId ? '\u23F3' : '\u25B6'}
              </span>
            </div>
          </button>

          {/* Remaining sessions (collapsed list) */}
          {sessions.length > 1 && (
            <SessionList
              sessions={sessions.slice(1)}
              onLoadSession={onLoadSession}
              loadingSessionId={loadingSessionId}
            />
          )}
        </div>
      )}
    </div>
  )
}

function SessionList({
  sessions,
  onLoadSession,
  loadingSessionId,
}: {
  sessions: LocalSessionSummary[]
  onLoadSession: (session: LocalSessionSummary) => void
  loadingSessionId: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? sessions : sessions.slice(0, 3)
  const hasMore = sessions.length > 3

  return (
    <div>
      <div className="max-h-40 overflow-auto space-y-1">
        {visible.map((session) => (
          <button
            key={session.sessionId}
            onClick={() => onLoadSession(session)}
            disabled={loadingSessionId !== null}
            className="w-full bg-gray-950/40 hover:bg-gray-800/60 border border-gray-700/40 rounded px-3 py-2 text-left transition-colors disabled:opacity-50 text-xs flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <span className="text-gray-300 truncate block">{session.project}</span>
              <span className="text-[10px] text-gray-500">
                {formatRelativeTime(session.updatedAt)}
                {' \u00b7 '}
                {session.fileCount} file{session.fileCount !== 1 ? 's' : ''}
                {' \u00b7 '}
                {formatBytes(session.totalBytes)}
              </span>
            </div>
            <span className="text-gray-500 hover:text-gray-300 shrink-0">
              {loadingSessionId === session.sessionId ? '\u23F3' : '\u25B6'}
            </span>
          </button>
        ))}
      </div>

      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] text-blue-400 hover:text-blue-300 mt-1 underline underline-offset-2"
        >
          Show {sessions.length - 3} more sessions
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
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

  const { sessions, isLoading: sessionsLoading, isLocalAvailable } = useLocalSessions()

  const fileNames = useMemo(() => files.map((file) => file.name), [files])
  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files])

  // ---- Auto-detect session load handler ----

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

  // ---- File acceptance per mode ----

  const isAcceptedFile = (file: File): boolean => {
    switch (importMode) {
      case 'files':
      case 'folder':
        return file.name.endsWith('.jsonl') || file.name.endsWith('.json')
      case 'zip':
        return file.name.endsWith('.zip')
    }
  }

  const inputAccept = (): string => {
    switch (importMode) {
      case 'files':
        return '.jsonl,.json,application/json'
      case 'folder':
        return ''
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
    // For folder mode, filter to only transcript files from the directory listing
    const filtered = importMode === 'folder'
      ? selected.filter((f) => f.name.endsWith('.jsonl') || f.name.endsWith('.json'))
      : selected
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
        return {
          title: 'Drop Claude transcript files here',
          subtitle: '.jsonl or .json transcript files',
        }
      case 'folder':
        return {
          title: 'Select a folder containing transcripts',
          subtitle: 'Find transcripts in ~/.claude/projects/',
        }
      case 'zip':
        return {
          title: 'Drop a .zip archive here',
          subtitle: '.zip containing .jsonl/.json files',
        }
    }
  }

  const buttonLabel = (): string => {
    switch (importMode) {
      case 'files':
        return 'Choose Files'
      case 'folder':
        return 'Choose Folder'
      case 'zip':
        return 'Choose Zip'
    }
  }

  const { title: dzTitle, subtitle: dzSubtitle } = dropZoneText()

  return (
    <div className="w-full h-full bg-gradient-to-b from-gray-950 to-gray-900 text-gray-100 flex items-center justify-center p-6 md:p-10 relative">
      <OnboardingBackdrop />
      <div className="relative z-10 w-full max-w-3xl bg-gray-900/80 border border-gray-700 rounded-xl p-6 md:p-8 shadow-2xl backdrop-blur-sm max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h1 className="font-pixel text-lg text-green-400 mb-2">Import Transcripts</h1>
          <p className="text-sm text-gray-300">
            Select a Claude Code session to visualize, or upload transcript files manually.
          </p>
        </div>

        {/* Warning banner (e.g., corrupt storage cleared) */}
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

        {/* ============================================================ */}
        {/* Section 1: Auto-detected sessions                            */}
        {/* ============================================================ */}
        <AutoDetectedPanel
          sessions={sessions}
          isLoading={sessionsLoading}
          isLocalAvailable={isLocalAvailable}
          onLoadSession={handleLoadSession}
          loadingSessionId={loadingSessionId}
        />

        {/* Separator — only show when auto-detected panel is visible */}
        {(sessionsLoading || isLocalAvailable) && (
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-700/50" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
              Or upload manually
            </span>
            <div className="flex-1 h-px bg-gray-700/50" />
          </div>
        )}

        {/* ============================================================ */}
        {/* Section 2: Manual upload (unchanged fallback)                 */}
        {/* ============================================================ */}
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

          {/* Import mode tabs */}
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
              onClick={() => setImportMode('folder')}
              className={`px-3 py-1.5 text-xs rounded ${
                importMode === 'folder'
                  ? 'bg-green-700 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Folder{!supportsFolder ? ' (limited)' : ''}
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

          {/* Folder mode: browser compatibility guidance */}
          {importMode === 'folder' && !supportsFolder && (
            <div className="text-xs text-yellow-300/70 bg-yellow-900/20 border border-yellow-800/30 rounded px-3 py-2">
              Folder upload may not work in all browsers. Try Files or Zip mode instead.
            </div>
          )}

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
              <label className="inline-flex items-center justify-center px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs cursor-pointer">
                {buttonLabel()}
                <input
                  type="file"
                  multiple={importMode !== 'zip'}
                  accept={inputAccept()}
                  className="hidden"
                  onChange={onUpload}
                  {...(importMode === 'folder' ? { webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement> : {})}
                />
              </label>
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
              {isImporting ? 'Importing...' : 'Run'}
            </button>
          </div>
        </div>
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
