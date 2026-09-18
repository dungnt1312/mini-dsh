import { Component, type ErrorInfo, type ReactNode } from 'react'
import Icon from './Icon.tsx'
import { Button } from '../ui/Button.tsx'

interface State { readonly error: Error | null }

/** App-level crash boundary: calm card, "the data is safe" wording, reload plus raw diagnostics. */
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
      <div className="flex h-dvh items-center justify-center bg-bg p-4 text-fg" role="alert">
        <div className="flex w-full max-w-md flex-col items-start gap-3 rounded-2xl border border-line p-6">
          <Icon name="alertTriangle" size={20} className="text-warn" />
          <strong className="text-base">Something broke in the interface</strong>
          <p className="m-0 text-sm text-fg-muted">The conversation data is safe on the server. Reload to continue.</p>
          <Button variant="primary" size="sm" onClick={() => window.location.reload()}>Reload</Button>
          <details className="w-full text-xs text-fg-muted">
            <summary>Details</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap">{this.state.error.message}</pre>
          </details>
        </div>
      </div>
    )
  }
}
