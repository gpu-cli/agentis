import { useRef, useState, type ChangeEventHandler } from 'react'
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@multiverse/ui'

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
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onFileSelected}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={triggerFilePicker}
              className="h-7 bg-muted px-2 text-xs hover:bg-accent"
              aria-label="Upload replay package"
            >
              Import JSON
            </Button>
          </TooltipTrigger>
          <TooltipContent>Upload replay package</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPaste((open) => !open)}
              className="h-7 bg-muted px-2 text-xs hover:bg-accent"
              aria-label="Paste replay JSON"
            >
              Paste
            </Button>
          </TooltipTrigger>
          <TooltipContent>Paste replay JSON</TooltipContent>
        </Tooltip>

        {showPaste ? (
          <div className="absolute top-16 right-4 z-50 w-[440px] bg-card border border-border rounded p-3 shadow-lg">
            <div className="text-[11px] text-muted-foreground mb-2">Paste universal-events JSON</div>
            <textarea
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              className="w-full h-36 bg-background text-card-foreground text-[11px] font-mono p-2 rounded border border-input"
              placeholder='{"schema":"universal-events", ...}'
            />
            <div className="mt-2 flex justify-between items-center">
              {errorMessage ? (
                <span className="text-[10px] text-red-400">{errorMessage}</span>
              ) : (
                <span className="text-[10px] text-muted-foreground">Ready to import</span>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={() => onImportJson(jsonText)}
                className="h-7 bg-green-700 px-2 text-xs hover:bg-green-600"
              >
                Load Replay
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  )
}
