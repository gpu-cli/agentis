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

export function ManualUploadPanel({ onImport, errorMessage, progress, sizeWarning, importWarnings }: ManualUploadPanelProps) {
  const [form, dispatchForm] = useReducer(formReducer, initialFormState)
  const { projectName, files, isDragging, isImporting, importMode } = form
  const folderInputRef = useRef<HTMLInputElement>(null)

  const fileNames = useMemo(() => files.map((file) => file.name), [files])
  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files])

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
        return { title: 'Drop transcript files here', subtitle: '.jsonl or .json' }
      case 'zip':
        return { title: 'Drop a .zip archive', subtitle: 'containing .jsonl or .json files' }
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

  return (
    <TabsContent value="manual">
      <div className="space-y-4">
        <label htmlFor="project-name-input" className="block">
          <span className="block text-xs uppercase tracking-wide text-muted-foreground mb-1">Project name</span>
          <Input
            id="project-name-input"
            value={projectName}
            onChange={(event) => dispatchForm({ type: 'setProjectName', payload: event.target.value })}
            placeholder="your-repo-name"
            className="bg-background border-input focus-visible:ring-ring"
          />
        </label>

        <div className="flex gap-1 mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatchForm({ type: 'setImportMode', payload: 'files' })}
            className={`h-7 px-3 text-xs ${
              importMode === 'files'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-accent'
            }`}
          >
            Files
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatchForm({ type: 'setImportMode', payload: 'zip' })}
            className={`h-7 px-3 text-xs ${
              importMode === 'zip'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-accent'
            }`}
          >
            Zip
          </Button>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault()
            dispatchForm({ type: 'setDragging', payload: true })
          }}
          onDragLeave={() => dispatchForm({ type: 'setDragging', payload: false })}
          onDrop={onDropZone}
          className={`border-2 border-dashed rounded-lg p-5 transition-colors ${
            isDragging ? 'border-green-400 bg-green-950/20' : 'border-border bg-background/40'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-sm text-card-foreground">{dzTitle}</div>
              <div className="text-xs text-muted-foreground mt-1">{dzSubtitle}</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center justify-center px-3 py-1.5 rounded bg-card hover:bg-accent text-xs cursor-pointer">
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
                <label className="inline-flex items-center justify-center px-3 py-1.5 rounded bg-card hover:bg-accent text-xs cursor-pointer">
                  Choose Folder
                  <input
                    ref={folderInputRef}
                    type="file"
                    className="hidden"
                    onChange={onFolderUpload}
                    {...{ webkitdirectory: '', directory: '' } as InputHTMLAttributes<HTMLInputElement>}
                  />
                </label>
              )}
            </div>
          </div>

          {fileNames.length > 0 ? (
            <div className="mt-3 text-xs text-card-foreground">
              <div className="mb-1 flex items-center gap-2">
                <span>{fileNames.length} file(s) selected</span>
                <span className="text-muted-foreground">({formatBytes(totalSize)})</span>
              </div>
              <ScrollArea viewportClassName="max-h-24" className="pr-1">
                <div className="space-y-1">
                  {files.map((file) => (
                    <div key={file.name} className="font-mono text-[11px] text-muted-foreground flex justify-between gap-2">
                      <span className="truncate">{file.name}</span>
                      <span className="text-muted-foreground/60 shrink-0">{formatBytes(file.size)}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : null}
        </div>

        {errorMessage ? <div className="text-xs text-red-400">{errorMessage}</div> : null}

        {isImporting && progress && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Stage: {progress.stage}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="w-full h-2 bg-card rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
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

        {sizeWarning && (
          <div className="mt-4 bg-yellow-900/30 border border-yellow-700/50 rounded p-4">
            <div className="text-sm text-yellow-200 mb-3">
              Projected uncompressed size: <strong>{formatBytes(sizeWarning.projectedSize)}</strong> (exceeds 20MB recommendation)
            </div>
            <div className="text-xs text-yellow-300/70 mb-3">
              Large transcripts may be slow to process. Continue anyway?
            </div>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={sizeWarning.onContinue}
                className="h-7 bg-yellow-700 px-3 text-xs hover:bg-yellow-600"
              >
                Continue
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={sizeWarning.onCancel}
                className="h-7 bg-muted px-3 text-xs hover:bg-accent"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {importWarnings && importWarnings.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-yellow-400 mb-1">Warnings ({importWarnings.length})</div>
            <ScrollArea viewportClassName="max-h-32" className="bg-background/60 border border-yellow-900/30 rounded p-2">
              <div className="space-y-1">
                {importWarnings.map((w) => (
                  <div key={w} className="text-[10px] font-mono text-yellow-300/70">{w}</div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="default"
            size="sm"
            onClick={startImport}
            disabled={projectName.trim().length === 0 || files.length === 0 || isImporting}
            className="h-8 bg-green-700 px-4 text-sm hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isImporting ? 'Processing...' : 'Visualize'}
          </Button>
        </div>
      </div>
    </TabsContent>
  )
}
