import { useRef, useState, type ChangeEventHandler } from 'react'

interface ReplayImportProps {
  onImportJson: (jsonText: string) => void
  errorMessage?: string | null
}

export function ReplayImport({ onImportJson, errorMessage }: ReplayImportProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [jsonText, setJsonText] = useState('')

  const triggerFilePicker = () => {
    fileInputRef.current?.click()
  }

  const onFileSelected: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const text = await file.text()
    onImportJson(text)
    event.currentTarget.value = ''
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onFileSelected}
      />
      <button
        onClick={triggerFilePicker}
        className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
        title="Upload replay package"
      >
        Import JSON
      </button>
      <button
        onClick={() => setShowPaste((open) => !open)}
        className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
        title="Paste replay JSON"
      >
        Paste
      </button>

      {showPaste ? (
        <div className="absolute top-16 right-4 z-50 w-[440px] bg-gray-900 border border-gray-700 rounded p-3 shadow-lg">
          <div className="text-[11px] text-gray-400 mb-2">Paste universal-events JSON</div>
          <textarea
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            className="w-full h-36 bg-gray-950 text-gray-200 text-[11px] font-mono p-2 rounded border border-gray-700"
            placeholder='{"schema":"universal-events", ...}'
          />
          <div className="mt-2 flex justify-between items-center">
            {errorMessage ? (
              <span className="text-[10px] text-red-400">{errorMessage}</span>
            ) : (
              <span className="text-[10px] text-gray-500">Ready to import</span>
            )}
            <button
              onClick={() => onImportJson(jsonText)}
              className="text-xs px-2 py-1 bg-green-700 hover:bg-green-600 rounded"
            >
              Load Replay
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
