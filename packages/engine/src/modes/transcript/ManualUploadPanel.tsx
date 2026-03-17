import { useMemo, useReducer, useRef, type ChangeEventHandler, type DragEvent, type InputHTMLAttributes } from 'react'
import { Button, Input, ScrollArea, TabsContent } from '@multiverse/ui'
import { mergeFiles } from '../../utils/files'
import { formatBytes } from '../../utils/formatting'

type ImportMode = 'files' | 'zip'

interface ManualUploadPanelProps {
  onImport: (projectName: string, files: File[]) => Promise<boolean>
  errorMessage?: string | null
  progress?: { stage: string; percent: number; bytesRead?: number; fileCount?: number; warningCount?: number } | null
  sizeWarning?: { projectedSize: number; onContinue: () => void; onCancel: () => void } | null
  importWarnings?: string[]
}

interface FormState {
  projectName: string
  files: File[]
  isDragging: boolean
  isImporting: boolean
  importMode: ImportMode
}

type FormAction =
  | { type: 'setProjectName'; payload: string }
  | { type: 'setFiles'; payload: File[] | ((prev: File[]) => File[]) }
  | { type: 'setDragging'; payload: boolean }
  | { type: 'setImporting'; payload: boolean }
  | { type: 'setImportMode'; payload: ImportMode }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'setProjectName': return { ...state, projectName: action.payload }
    case 'setFiles': return { ...state, files: typeof action.payload === 'function' ? action.payload(state.files) : action.payload }
    case 'setDragging': return { ...state, isDragging: action.payload }
    case 'setImporting': return { ...state, isImporting: action.payload }
    case 'setImportMode': return { ...state, importMode: action.payload }
  }
}

const initialFormState: FormState = {
  projectName: '',
  files: [],
  isDragging: false,
  isImporting: false,
  importMode: 'files',
}

// ---------------------------------------------------------------------------
// Section wrapper — creates visual separation between form blocks
// ---------------------------------------------------------------------------

function FormSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border/40 bg-background/30 p-4 ${className}`}>
      {children}
    </div>
  )
}

function SectionLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-2">
      {children}
    </label>
  )
}

function SectionHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-muted-foreground/70 mt-1.5">{children}</p>
}

// ---------------------------------------------------------------------------
// Readiness helpers
// ---------------------------------------------------------------------------

function getDisabledReason(projectName: string, filesCount: number, isImporting: boolean): string | null {
  if (isImporting) return null
  if (projectName.trim().length === 0 && filesCount === 0) return 'Enter a project name and add transcript files'
  if (projectName.trim().length === 0) return 'Enter a project name to continue'
  if (filesCount === 0) return 'Add at least one transcript file'
  return null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ManualUploadPanel({ onImport, errorMessage, progress, sizeWarning, importWarnings }: ManualUploadPanelProps) {
  const [form, dispatchForm] = useReducer(formReducer, initialFormState)
  const { projectName, files, isDragging, isImporting, importMode } = form
  const folderInputRef = useRef<HTMLInputElement>(null)

  const fileNames = useMemo(() => files.map((file) => file.name), [files])
  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files])

  const isReady = projectName.trim().length > 0 && files.length > 0 && !isImporting
  const disabledReason = getDisabledReason(projectName, files.length, isImporting)

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

  const dropZoneText = (): { title: string; subtitle: string } => {
    switch (importMode) {
      case 'files':
        return { title: 'Drop transcript files here', subtitle: 'Accepts .jsonl and .json files' }
      case 'zip':
        return { title: 'Drop a .zip archive', subtitle: 'Containing .jsonl or .json files' }
    }
  }

  const onDropZone = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dispatchForm({ type: 'setDragging', payload: false })
    const droppedFiles = Array.from(event.dataTransfer.files).filter(isAcceptedFile)
    if (droppedFiles.length > 0) {
      dispatchForm({ type: 'setFiles', payload: (current) => mergeFiles(current, droppedFiles) })
    }
  }

  const onUpload: ChangeEventHandler<HTMLInputElement> = (event) => {
    const selected = Array.from(event.target.files ?? [])
    if (selected.length > 0) {
      dispatchForm({ type: 'setFiles', payload: (current) => mergeFiles(current, selected) })
    }
    event.currentTarget.value = ''
  }

  const onFolderUpload: ChangeEventHandler<HTMLInputElement> = (event) => {
    const selected = Array.from(event.target.files ?? [])
    const filtered = selected.filter((f) => f.name.endsWith('.jsonl') || f.name.endsWith('.json'))
    if (filtered.length > 0) {
      dispatchForm({ type: 'setFiles', payload: (current) => mergeFiles(current, filtered) })
    }
    event.currentTarget.value = ''
  }

  const clearFiles = () => {
    dispatchForm({ type: 'setFiles', payload: [] })
  }

  const startImport = async () => {
    if (projectName.trim().length === 0 || files.length === 0 || isImporting) {
      return
    }
    dispatchForm({ type: 'setImporting', payload: true })
    try {
      await onImport(projectName.trim(), files)
    } finally {
      dispatchForm({ type: 'setImporting', payload: false })
    }
  }

  const { title: dzTitle, subtitle: dzSubtitle } = dropZoneText()
  const hasFiles = fileNames.length > 0

  return (
    <TabsContent value="manual">
      <div className="space-y-5">

        {/* ================================================================
            Section 1: Project Name
            ================================================================ */}
        <FormSection>
          <SectionLabel htmlFor="project-name-input">Project name</SectionLabel>
          <Input
            id="project-name-input"
            value={projectName}
            onChange={(event) => dispatchForm({ type: 'setProjectName', payload: event.target.value })}
            placeholder="your-repo-name"
            className="bg-surface-1 border-border/60 focus-visible:ring-primary/50 focus-visible:border-primary/40"
          />
          <SectionHint>Used as the world label in the visualization.</SectionHint>
        </FormSection>

        {/* ================================================================
            Section 2: Import Mode + File Drop
            ================================================================ */}
        <FormSection>
          <SectionLabel>Transcript source</SectionLabel>

          {/* ---- Mode toggle ---- */}
          <div className="inline-flex rounded-md border border-border/50 bg-surface-1 p-0.5 mb-4" role="radiogroup" aria-label="Import mode">
            <button
              type="button"
              role="radio"
              aria-checked={importMode === 'files'}
              onClick={() => dispatchForm({ type: 'setImportMode', payload: 'files' })}
              className={`relative rounded-[5px] px-4 py-1.5 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                importMode === 'files'
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Files
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={importMode === 'zip'}
              onClick={() => dispatchForm({ type: 'setImportMode', payload: 'zip' })}
              className={`relative rounded-[5px] px-4 py-1.5 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                importMode === 'zip'
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Zip
            </button>
          </div>

          {/* ---- Drop zone ---- */}
          <div
            onDragOver={(event) => {
              event.preventDefault()
              dispatchForm({ type: 'setDragging', payload: true })
            }}
            onDragLeave={() => dispatchForm({ type: 'setDragging', payload: false })}
            onDrop={onDropZone}
            className={`relative rounded-lg border-2 border-dashed p-5 transition-all duration-200 ${
              isDragging
                ? 'border-primary bg-primary/5 shadow-[inset_0_0_20px_rgba(74,222,128,0.06)]'
                : hasFiles
                  ? 'border-primary/30 bg-primary/[0.03]'
                  : 'border-border/60 bg-surface-1/50 hover:border-border'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className={`text-sm font-medium ${hasFiles ? 'text-primary/80' : 'text-card-foreground'}`}>
                  {isDragging ? 'Release to add files' : dzTitle}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{dzSubtitle}</div>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center justify-center px-3 py-1.5 rounded-md border border-border/50 bg-surface-1 hover:bg-accent hover:border-border text-xs text-foreground/80 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background">
                  {importMode === 'files' ? 'Choose Files' : 'Choose Zip'}
                  <input
                    type="file"
                    multiple={importMode !== 'zip'}
                    accept={inputAccept()}
                    className="sr-only"
                    onChange={onUpload}
                  />
                </label>
                {importMode === 'files' && (
                  <label className="inline-flex items-center justify-center px-3 py-1.5 rounded-md border border-border/50 bg-surface-1 hover:bg-accent hover:border-border text-xs text-foreground/80 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background">
                    Choose Folder
                    <input
                      ref={folderInputRef}
                      type="file"
                      className="sr-only"
                      onChange={onFolderUpload}
                      {...{ webkitdirectory: '', directory: '' } as InputHTMLAttributes<HTMLInputElement>}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* ---- Selected files summary ---- */}
            {hasFiles ? (
              <div className="mt-4 pt-3 border-t border-border/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/20 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                      {fileNames.length} file{fileNames.length !== 1 ? 's' : ''} ready
                    </span>
                    <span className="text-[11px] text-muted-foreground">{formatBytes(totalSize)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={clearFiles}
                    className="text-[10px] text-muted-foreground/60 hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <ScrollArea viewportClassName="max-h-24" className="pr-1">
                  <div className="space-y-0.5">
                    {files.map((file) => (
                      <div key={file.name} className="font-mono text-[11px] text-muted-foreground/80 flex justify-between gap-2">
                        <span className="truncate">{file.name}</span>
                        <span className="text-muted-foreground/50 shrink-0">{formatBytes(file.size)}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : null}
          </div>
        </FormSection>

        {/* ================================================================
            Validation: Error message
            ================================================================ */}
        {errorMessage ? (
          <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-xs text-red-300" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {/* ================================================================
            Validation: Size warning (interruptive — requires decision)
            ================================================================ */}
        {sizeWarning && (
          <div className="rounded-lg border border-yellow-600/40 bg-yellow-950/20 p-4" role="alert" aria-live="polite">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-yellow-400 text-sm shrink-0" aria-hidden="true">!</span>
              <div className="flex-1">
                <div className="text-sm text-yellow-200 font-medium mb-1">
                  Large transcript ({formatBytes(sizeWarning.projectedSize)})
                </div>
                <div className="text-[11px] text-yellow-300/60 mb-3">
                  Exceeds the 20MB recommendation. Processing may be slow.
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={sizeWarning.onContinue}
                    className="h-7 bg-yellow-600 px-3 text-xs font-medium text-yellow-50 hover:bg-yellow-500 shadow-sm"
                  >
                    Continue anyway
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={sizeWarning.onCancel}
                    className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            Progress bar (during import)
            ================================================================ */}
        {isImporting && progress && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-4 space-y-2" aria-live="polite" aria-label="Import progress">
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground/80 font-medium">{progress.stage}</span>
              <span className="text-muted-foreground tabular-nums">{progress.percent}%</span>
            </div>
            <div className="w-full h-1.5 bg-surface-1 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="flex gap-4 text-[10px] text-muted-foreground">
              {progress.bytesRead != null && <span>{formatBytes(progress.bytesRead)} read</span>}
              {progress.fileCount != null && <span>{progress.fileCount} files</span>}
              {progress.warningCount != null && progress.warningCount > 0 && (
                <span className="text-yellow-500">{progress.warningCount} warnings</span>
              )}
            </div>
          </div>
        )}

        {/* ================================================================
            Import warnings (non-blocking, post-import diagnostics)
            ================================================================ */}
        {importWarnings && importWarnings.length > 0 && (
          <div className="rounded-lg border border-yellow-800/30 bg-yellow-950/10 p-3">
            <div className="text-[11px] font-medium text-yellow-400/80 mb-1.5">Warnings ({importWarnings.length})</div>
            <ScrollArea viewportClassName="max-h-32" className="pr-1">
              <div className="space-y-1">
                {importWarnings.map((w) => (
                  <div key={w} className="text-[10px] font-mono text-yellow-300/60">{w}</div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ================================================================
            Primary CTA
            ================================================================ */}
        <div className="pt-1">
          <Button
            variant="default"
            size="sm"
            onClick={startImport}
            disabled={!isReady}
            className={`h-10 px-6 text-sm font-medium transition-all duration-200 ${
              isReady
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
            }`}
          >
            {isImporting ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                Processing...
              </span>
            ) : (
              'Visualize'
            )}
          </Button>

          {/* Disabled reason hint */}
          {disabledReason && !isImporting && (
            <p className="text-[10px] text-muted-foreground/60 mt-2">{disabledReason}</p>
          )}
        </div>
      </div>
    </TabsContent>
  )
}
