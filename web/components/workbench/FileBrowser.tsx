import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../common/Icon.tsx'
import { ErrorNotice } from '../common/ErrorNotice.tsx'
import { Spinner } from '../common/Spinner.tsx'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { listProjectFiles, type ProjectListing } from '../../lib/api.ts'
import { fileStyle, type FileIconStyle } from '../../lib/file-icons.ts'
import { cn } from '../../lib/cn.ts'

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** One folder level of a project: breadcrumb, folders first, files open as tabs. */
export function FileBrowser({ workspaceId, project, folder, activeFile, onFolder, onOpenFile }: {
  readonly workspaceId: string
  readonly project: { readonly id: string; readonly name: string; readonly path: string }
  readonly folder: string
  readonly activeFile: string | null
  readonly onFolder: (folder: string) => void
  readonly onOpenFile: (path: string) => void
}) {
  const [listing, setListing] = useState<ProjectListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  const load = useCallback(async () => {
    const request = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const next = await listProjectFiles(workspaceId, project.id, folder)
      if (generation.current === request) setListing(next)
    } catch (cause) {
      if (generation.current === request) setError(String(cause))
    } finally {
      if (generation.current === request) setLoading(false)
    }
  }, [workspaceId, project.id, folder])

  useEffect(() => { void load() }, [load])

  const segments = folder === '' ? [] : folder.split('/')
  const parent = segments.slice(0, -1).join('/')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-3 text-[13px]">
        <nav aria-label="Folder path" className="flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap">
          <button type="button" className="shrink-0 truncate rounded px-1 text-fg-muted hover:text-fg" title={project.path} onClick={() => onFolder('')}>
            {project.path}
          </button>
          {segments.map((segment, index) => (
            <Fragment key={`${index}-${segment}`}>
              <span className="px-0.5 text-fg-faint" aria-hidden="true">/</span>
              <button
                type="button"
                className={cn('truncate rounded px-1 hover:text-fg', index === segments.length - 1 ? 'font-medium text-fg' : 'text-fg-muted')}
                aria-current={index === segments.length - 1 ? 'location' : undefined}
                onClick={() => onFolder(segments.slice(0, index + 1).join('/'))}
              >
                {segment}
              </button>
            </Fragment>
          ))}
        </nav>
        <IconButton label="Refresh files" onClick={() => void load()}><Icon name="refresh" size={15} /></IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {error !== null ? (
          <div className="flex flex-col items-start gap-2 p-2">
            <ErrorNotice raw={error} />
            <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : loading && listing === null ? (
          <div className="flex items-center gap-2 p-3 text-sm text-fg-muted" role="status"><Spinner size={13} />Loading files…</div>
        ) : (
          <ul aria-label="Project files" className="m-0 flex list-none flex-col p-0">
            {folder !== '' ? (
              <li>
                <button type="button" className="flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-fg-muted hover:bg-hover hover:text-fg" onClick={() => onFolder(parent)}>
                  <Icon name="arrowUp" size={15} />
                  <span>Parent folder</span>
                </button>
              </li>
            ) : null}
            {listing?.entries.map((entry) => {
              const icon: FileIconStyle = entry.kind === 'dir' ? { name: 'folder', className: 'text-fg-muted' } : fileStyle(entry.name)
              return (
                <li key={entry.path}>
                  <button
                    type="button"
                    title={entry.path}
                    onClick={() => entry.kind === 'dir' ? onFolder(entry.path) : onOpenFile(entry.path)}
                    className={cn('flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm hover:bg-hover', entry.path === activeFile && 'bg-hover')}
                  >
                    <Icon name={icon.name} size={15} className={icon.className} />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    {entry.kind === 'file' ? <span className="shrink-0 text-xs text-fg-faint">{formatSize(entry.size)}</span> : <Icon name="chevronRight" size={14} className="shrink-0 text-fg-faint" />}
                  </button>
                </li>
              )
            })}
            {listing !== null && listing.entries.length === 0 ? <li className="px-2.5 py-3 text-sm text-fg-faint">This folder is empty.</li> : null}
          </ul>
        )}
      </div>
    </div>
  )
}
