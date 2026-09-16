import { errorSummary } from '../../lib/copy.ts'
export function ErrorNotice({ raw }: { readonly raw: string }) {
  return <div className="error-notice" role="alert"><p>{errorSummary(raw)}</p><details><summary>Original response</summary><pre>{raw}</pre></details></div>
}
