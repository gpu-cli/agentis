// ============================================================================
// ErrorBoundary — Catches render errors to prevent full-tab crashes
// ============================================================================

import { Component, type ReactNode, type ErrorInfo } from 'react'
import { Button } from '@multiverse/ui'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="w-full h-full bg-background flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <h2 className="text-red-400 font-pixel text-sm mb-2">
                Rendering Error
              </h2>
              <p className="text-muted-foreground text-xs mb-4">
                {this.state.error.message}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => this.setState({ error: null })}
                className="h-7 bg-muted px-3 text-xs text-card-foreground hover:bg-accent"
              >
                Try Again
              </Button>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}
