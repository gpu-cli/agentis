// ============================================================================
// ErrorBoundary — Catches render errors to prevent full-tab crashes
// ============================================================================

import { Component, type ReactNode, type ErrorInfo } from 'react'

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
          <div className="w-full h-full bg-gray-950 flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <h2 className="text-red-400 font-pixel text-sm mb-2">
                Rendering Error
              </h2>
              <p className="text-gray-400 text-xs mb-4">
                {this.state.error.message}
              </p>
              <button
                onClick={() => this.setState({ error: null })}
                className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-200"
              >
                Try Again
              </button>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}
