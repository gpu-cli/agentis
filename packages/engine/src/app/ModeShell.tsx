// ============================================================================
// ModeShell — Top-level mode router
// ============================================================================

import { useModeStore } from './modeStore'
import { OnboardingBackdrop } from '../components/OnboardingBackdrop'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { GlobalErrorCatcher } from '../components/GlobalErrorCatcher'
import { DemoPage } from '../modes/demo/DemoPage'
import { TranscriptPage } from '../modes/transcript/TranscriptPage'
import { Button } from '@multiverse/ui'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ModeShellProps {
  /** URL to navigate to when local mode is not available (e.g. "/install") */
  localInstallUrl?: string
  onNavigate?: (url: string) => void
}

// ---------------------------------------------------------------------------
// Mode Selection Screen
// ---------------------------------------------------------------------------

function ModeSelection({
  localInstallUrl,
  onNavigate,
}: {
  localInstallUrl?: string
  onNavigate?: (url: string) => void
}) {
  const setMode = useModeStore((s) => s.setMode)

  const handleTranscriptClick = () => {
    if (localInstallUrl) {
      // Local mode not available — redirect to install page
      if (onNavigate) {
        onNavigate(localInstallUrl)
      } else {
        window.location.href = localInstallUrl
      }
    } else {
      setMode('transcript')
    }
  }

  return (
    <div className="w-full h-full bg-gradient-to-b from-background to-card text-foreground flex items-center justify-center p-6 md:p-10 relative overflow-hidden">
      <OnboardingBackdrop />

      {/* Content layer — above backdrop */}
      <div className="relative z-10 w-full max-w-3xl bg-surface-2/80 border border-border rounded-xl p-6 shadow-2xl backdrop-blur-sm">
        <div className="mb-6">
          <h1 className="font-pixel text-lg text-primary mb-2 drop-shadow-[0_0_24px_rgba(74,222,128,0.35)]">
            Agentis
          </h1>
          <p className="text-sm text-muted-foreground">
            Visualize coding sessions as an interactive pixel-art world.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Demo Mode */}
          <Button
            onClick={() => setMode('demo')}
            variant="card"
            size="card"
            className="group flex-col items-start justify-start"
          >
            <div className="text-2xl mb-3">🎮</div>
            <h2 className="font-pixel text-sm text-primary mb-2 group-hover:text-primary/80 transition-colors">
              Demo Mode
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Explore pre-built scenarios.
            </p>
          </Button>

          {/* Transcript Mode / Run Locally */}
          <Button
            onClick={handleTranscriptClick}
            variant="card"
            size="card"
            className="group flex-col items-start justify-start hover:border-secondary/50 hover:shadow-[0_0_30px_rgba(var(--color-secondary),0.08)]"
          >
            <div className="text-2xl mb-3">{localInstallUrl ? '🏃' : '🏗️'}</div>
            <h2 className="font-pixel text-sm text-secondary mb-2 group-hover:text-secondary/80 transition-colors">
              {localInstallUrl ? 'Run Locally' : 'Import A Transcript'}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {localInstallUrl ? 'Set up Agentis to visualize your own local sessions.' : 'Upload transcripts locally.'}
            </p>
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ModeShell — Top-level router
// ---------------------------------------------------------------------------

export function ModeShell({ localInstallUrl, onNavigate }: ModeShellProps) {
  const mode = useModeStore((s) => s.mode)

  if (mode === null) {
    return (
      <>
        <GlobalErrorCatcher />
        <ModeSelection localInstallUrl={localInstallUrl} onNavigate={onNavigate} />
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
      <ErrorBoundary><TranscriptPage isLocalEnabled={!localInstallUrl} localInstallUrl={localInstallUrl} /></ErrorBoundary>
    </>
  )
}
