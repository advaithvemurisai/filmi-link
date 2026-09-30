import { Component, type ReactNode } from 'react'

/** Last line of defence: show a way out instead of a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  reset = () => {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('fl:')).forEach((k) => localStorage.removeItem(k))
    } catch { /* ignore */ }
    location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="splash crash">
        <div>
          <h2>The reel snapped.</h2>
          <p>Something went wrong loading your saved game. Resetting clears your saved progress in this browser.</p>
          <button className="btn primary" onClick={this.reset}>Reset &amp; reload</button>
          <pre>{this.state.error.message}</pre>
        </div>
      </div>
    )
  }
}
