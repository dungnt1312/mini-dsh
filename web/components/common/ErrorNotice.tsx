import { errorSummary } from '../../lib/copy.ts'

export function ErrorNotice({ raw }: { readonly raw: string }) {
  return (
    <div className="error-notice rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad" role="alert">
      <p className="m-0">{errorSummary(raw)}</p>
      <details className="mt-1 text-fg-muted">
        <summary className="text-xs">Original response</summary>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">{raw}</pre>
      </details>
    </div>
  )
}
