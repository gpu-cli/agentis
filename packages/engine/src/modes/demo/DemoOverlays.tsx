import { Button } from '@multiverse/ui'

export function DemoLoadingOverlay({ stage, percent }: { stage: string; percent: number }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-72 shadow-2xl">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Loading Demo</div>
        <div className="text-sm text-gray-200 mb-3 capitalize">{stage}...</div>
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="text-right text-[10px] text-gray-500 mt-1">{percent}%</div>
      </div>
    </div>
  )
}

export function DemoErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-red-900/60 border-b border-red-700/50 px-4 py-2 flex items-center justify-between shrink-0">
      <span className="text-xs text-red-200">{message}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRetry}
        className="ml-4 h-6 px-2 text-xs text-red-300 hover:text-red-100"
      >
        Retry
      </Button>
    </div>
  )
}
