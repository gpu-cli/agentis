// ============================================================================
// ModeShell — Top-level mode router
// ============================================================================

import { useModeStore } from './modeStore'
import { OnboardingBackdrop } from '../components/OnboardingBackdrop'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { GlobalErrorCatcher } from '../components/GlobalErrorCatcher'
import { DemoPage } from '../modes/demo/DemoPage'
import { TranscriptPage } from '../modes/transcript/TranscriptPage'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ModeShellProps {}

// ---------------------------------------------------------------------------
// Mode Selection Screen
// ---------------------------------------------------------------------------

function ModeSelection() {
  const setMode = useModeStore((s) => s.setMode)

  return (
    <div className="w-full h-full bg-gradient-to-b from-gray-950 to-gray-900 text-gray-100 flex items-center justify-center p-6 md:p-10 relative overflow-hidden">
      <OnboardingBackdrop />

      {/* Content layer — above backdrop */}
      <div className="relative z-10 w-full max-w-3xl bg-gray-900/80 border border-gray-700 rounded-xl p-6 md:p-8 shadow-2xl backdrop-blur-sm">
        <div className="mb-6">
          <h1 className="font-pixel text-lg text-green-400 mb-2 drop-shadow-[0_0_24px_rgba(74,222,128,0.35)]">
            Multiverse
          </h1>
          <p className="text-sm text-gray-300">
            Visualize coding sessions as an interactive pixel-art world.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Demo Mode */}
          <button
            onClick={() => setMode('demo')}
            className="group cursor-pointer bg-gray-950/70 backdrop-blur-sm border border-gray-700/60 rounded-xl p-6 text-left hover:border-green-500/50 hover:bg-gray-950/80 hover:shadow-[0_0_30px_rgba(74,222,128,0.08)] transition-all duration-300"
          >
            <div className="text-2xl mb-3">🎮</div>
            <h2 className="font-pixel text-sm text-green-400 mb-2 group-hover:text-green-300 transition-colors">
              Demo Mode
            </h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              Explore pre-built scenarios.
            </p>
          </button>

          {/* Transcript Mode */}
          <button
            onClick={() => setMode('transcript')}
            className="group cursor-pointer bg-gray-950/70 backdrop-blur-sm border border-gray-700/60 rounded-xl p-6 text-left hover:border-blue-500/50 hover:bg-gray-950/80 hover:shadow-[0_0_30px_rgba(96,165,250,0.08)] transition-all duration-300"
          >
            <div className="text-2xl mb-3">🔒</div>
            <h2 className="font-pixel text-sm text-blue-400 mb-2 group-hover:text-blue-300 transition-colors">
              Import A Transcript
            </h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              Upload transcripts from your local machine.
            </p>
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ModeShell — Top-level router
// ---------------------------------------------------------------------------

export function ModeShell(_props: ModeShellProps) {
  const mode = useModeStore((s) => s.mode)

  if (mode === null) {
    return (
      <>
        <GlobalErrorCatcher />
        <ModeSelection />
      </>
    )
  }

  if (mode === 'demo') {
    return (
      <>
        <GlobalErrorCatcher />
        <ErrorBoundary><DemoPage /></ErrorBoundary>
      </>
    )
  }

  return (
    <>
      <GlobalErrorCatcher />
      <ErrorBoundary><TranscriptPage /></ErrorBoundary>
    </>
  )
}
