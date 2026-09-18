import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../common/Icon.tsx'
import CopyButton from '../common/CopyButton.tsx'
import { ErrorNotice } from '../common/ErrorNotice.tsx'
import { Spinner } from '../common/Spinner.tsx'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { readProjectFile, type ProjectFileView } from '../../lib/api.ts'
import { escapeHtml, highlight, languageOfFile } from '../../lib/highlight.ts'

/** Above this size files render as plain escaped text to keep the viewer responsive. */
const HIGHLIGHT_LIMIT = 200_000

/** Read-only file view: path bar, language, copy, and line-numbered highlighted content. */
export function FileViewer({ workspaceId, projectId, projectPath, path }: {
  readonly workspaceId: string
  readonly projectId: string
  readonly projectPath: string
  readonly path: string
}) {
  const [file, setFile] = useState<ProjectFileView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)

  const load = useCallback(async () => {
    const request = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const next = await readProjectFile(workspaceId, projectId, path)
      if (generation.current === request) setFile(next)
    } catch (cause) {
      if (generation.current === request) setError(String(cause))
    } finally {
      if (generation.current === request) setLoading(false)
    }
  }, [workspaceId, projectId, path])

  useEffect(() => { void load() }, [load])

  const language = languageOfFile(path)
  const html = useMemo(() => {
    if (file === null || file.binary) return ''
    return file.content.length > HIGHLIGHT_LIMIT ? escapeHtml(file.content) : highlight(file.content, language)
  }, [file, language])
  const lineCount = file === null || file.binary ? 0 : file.content.replace(/\n$/, '').split('\n').length
  const separator = projectPath.includes('\\') ? '\\' : '/'
  const fullPath = `${projectPath.replace(/[\\/]+$/, '')}${separator}${path.split('/').join(separator)}`

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3 text-[13px]">
        <span className="min-w-0 flex-1 truncate text-fg-muted" title={fullPath}>{fullPath}</span>
        <IconButton label="Reload file" onClick={() => void load()}><Icon name="refresh" size={15} /></IconButton>
      </div>
      {error !== null ? (
        <div className="flex flex-col items-start gap-2 p-3">
          <ErrorNotice raw={error} />
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      ) : loading && file === null ? (
        <div className="flex items-center gap-2 p-3 text-sm text-fg-muted" role="status"><Spinner size={13} />Loading file…</div>
      ) : file !== null ? (
        <>
          <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line px-3 text-xs text-fg-muted">
            <span className="font-mono">{language}{file.truncated ? ` · first ${Math.round(file.content.length / 1024)} KB of ${Math.round(file.size / 1024)} KB` : ''}</span>
            {!file.binary ? <CopyButton text={file.content} label="Copy file contents" className="size-7" /> : null}
          </div>
          {file.binary ? (
            <p className="m-0 p-4 text-sm text-fg-muted">Binary file ({file.size.toLocaleString()} bytes) — not shown.</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto" role="region" aria-label={`Contents of ${path}`} tabIndex={0}>
              {file.truncated ? <p className="m-0 border-b border-line bg-warn-soft px-3 py-1.5 text-xs text-warn">File is larger than 1 MB; only the beginning is shown.</p> : null}
              <div className="flex min-w-max font-mono text-[12.5px] leading-5">
                <pre aria-hidden="true" className="m-0 select-none py-2 pl-3 pr-4 text-right text-fg-faint">
                  {Array.from({ length: lineCount }, (_, index) => index + 1).join('\n')}
                </pre>
                <pre className="m-0 py-2 pr-6"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
