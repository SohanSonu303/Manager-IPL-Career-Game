import { Component, type ReactNode } from 'react'

/**
 * Catches a crash on one screen and says so, instead of leaving a blank page. The Shell
 * re-keys it on every route, so leaving the screen clears the error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="screen">
        <h1>Something went wrong</h1>
        <p className="dim">
          This screen hit an error. Your career is saved. Go back to the club and try again; if it
          keeps happening, export your career from Settings first.
        </p>
        <pre className="error-detail">{this.state.error.message}</pre>
        <div className="button-row">
          <button className="primary" onClick={() => (window.location.hash = '#/')}>
            Back to the club
          </button>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}
