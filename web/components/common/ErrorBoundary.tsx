import { Component, type ErrorInfo, type ReactNode } from 'react'
import Icon from './Icon.tsx'
import { Button } from '../ui/Button.tsx'

interface State { readonly error: Error | null }

/**
 * App-level crash boundary (spec: Global states): a neutral card on the
 * 760px axis — amber in the icon only, "the data is safe" wording, reload
 * plus collapsed raw diagnostics. No full-red screens.
 */
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error === null) return this.props.children
    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary-card">
          <Icon name="alertTriangle" size={18} className="error-boundary-icon" />
          <strong>Something broke in the interface</strong>
          <p>The conversation data is safe on the server. Reload to continue.</p>
          <Button variant="primary" size="sm" onClick={() => window.location.reload()}>Reload</Button>
          <details>
            <summary>Details</summary>
            <pre>{this.state.error.message}</pre>
          </details>
        </div>
      </div>
    )
  }
}
