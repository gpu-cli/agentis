import { useMemo, useState, type ChangeEventHandler, type DragEvent } from 'react'
import { OnboardingBackdrop } from './OnboardingBackdrop'

interface OnboardingScreenProps {
  onStartDemo: () => void
  onImportClaudeTranscripts: (projectName: string, files: File[]) => Promise<boolean>
  errorMessage?: string | null
}

export function OnboardingScreen({
  onStartDemo,
  onImportClaudeTranscripts,
  errorMessage,
}: OnboardingScreenProps) {
  const [projectName, setProjectName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const fileNames = useMemo(() => files.map((file) => file.name), [files])

  const onDropZone = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(event.dataTransfer.files).filter((file) =>
      file.name.endsWith('.jsonl') || file.name.endsWith('.json'),
    )
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

  const startImport = async () => {
    if (projectName.trim().length === 0 || files.length === 0 || isImporting) {
      return
    }

    setIsImporting(true)
    await onImportClaudeTranscripts(projectName.trim(), files)
    setIsImporting(false)
  }

  return (
    <div className="w-full h-full bg-gradient-to-b from-gray-950 to-gray-900 text-gray-100 flex items-center justify-center p-6 md:p-10 relative">
      <OnboardingBackdrop />
      <div className="relative z-10 w-full max-w-3xl bg-gray-900/80 border border-gray-700 rounded-xl p-6 md:p-8 shadow-2xl backdrop-blur-sm">
        <div className="mb-6">
          <h1 className="font-pixel text-lg text-green-400 mb-2">Multiverse Onboarding</h1>
          <p className="text-sm text-gray-300">
            Name your project and upload Claude transcript files to run a simulation.
          </p>
        </div>

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
                <div className="text-sm text-gray-200">Drop Claude transcript files here</div>
                <div className="text-xs text-gray-500 mt-1">.jsonl or .json transcript files</div>
              </div>
              <label className="inline-flex items-center justify-center px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs cursor-pointer">
                Choose Files
                <input
                  type="file"
                  multiple
                  accept=".jsonl,.json,application/json"
                  className="hidden"
                  onChange={onUpload}
                />
              </label>
            </div>

            {fileNames.length > 0 ? (
              <div className="mt-3 text-xs text-gray-300">
                <div className="mb-1">{fileNames.length} file(s) selected:</div>
                <div className="max-h-24 overflow-auto space-y-1 pr-1">
                  {fileNames.map((name) => (
                    <div key={name} className="font-mono text-[11px] text-gray-400">{name}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {errorMessage ? <div className="text-xs text-red-400">{errorMessage}</div> : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={startImport}
              disabled={projectName.trim().length === 0 || files.length === 0 || isImporting}
              className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isImporting ? 'Importing...' : 'Run'}
            </button>
            <button
              onClick={onStartDemo}
              className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm"
            >
              Skip for Demo
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
