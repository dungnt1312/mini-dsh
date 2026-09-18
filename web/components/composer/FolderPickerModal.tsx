import { useCallback, useEffect, useRef, useState } from 'react'
import { listDirs, type FolderListing } from '../../lib/api.ts'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Modal } from '../ui/Modal.tsx'
import Icon from '../common/Icon.tsx'
import { Spinner } from '../common/Spinner.tsx'

/**
 * Server-backed folder picker (spec: no-modal new-chat flow). A browser never
 * reveals a chosen folder's absolute path, so the picker navigates real
 * machine directories listed by `/api/fs/dirs` — click a row to descend, Up
 * to climb, and the primary action registers the folder shown in the path
 * bar. A paste-path input covers drives and deep paths directly.
 */
export function FolderPickerModal({
  open,
  onDismiss,
  onConfirm,
}: {
  readonly open: boolean
  readonly onDismiss: () => void
  readonly onConfirm: (path: string) => void
}) {
  const [listing, setListing] = useState<FolderListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualPath, setManualPath] = useState('')
  const generation = useRef(0)

  const load = useCallback(async (target?: string) => {
    const request = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const next = await listDirs(target)
      if (generation.current !== request) return
      setListing(next)
    } catch (cause) {
      if (generation.current !== request) return
      setError(String(cause))
    } finally {
      if (generation.current === request) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const step = (offset: number, from: HTMLButtonElement): void => {
    const rows = [...(from.closest('.folder-picker-list')?.querySelectorAll<HTMLButtonElement>('.folder-picker-row') ?? [])]
    const index = rows.indexOf(from)
    rows[Math.max(0, Math.min(rows.length - 1, (index === -1 ? 0 : index) + offset))]?.focus()
  }

  return (
    <Modal
      open={open}
      onDismiss={onDismiss}
      label="Choose a project folder"
      width="md"
      bodyClassName="flex flex-col gap-3 p-0"
      header={
        <>
          <span className="flex min-w-0 flex-col">
            <strong className="text-base font-semibold">Choose a project folder</strong>
            <small className="text-xs text-fg-faint">The folder registers as a project; the conversation is created by your first message.</small>
          </span>
          <IconButton label="Close folder picker" size="md" onClick={onDismiss}><Icon name="close" size={18} /></IconButton>
        </>
      }
    >
      <div className="flex items-center gap-2 px-5 pt-4">
        <IconButton
          label={listing?.parent ? `Go to parent folder ${listing.parent}` : 'Go to parent folder'}
          variant="outline"
          disabled={listing?.parent === null || listing === null}
          onClick={() => { if (listing?.parent !== null && listing !== null) void load(listing.parent) }}
        >
          <Icon name="arrowUp" size={16} />
        </IconButton>
        <span className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-1.5 font-mono text-xs" title={listing?.path ?? undefined}>{listing?.path ?? (loading ? 'Loading…' : '—')}</span>
      </div>
      <div className="folder-picker-list mx-5 h-[min(320px,45dvh)] overflow-y-auto rounded-xl border border-line p-1" role="listbox" aria-label="Folders">
        {error !== null ? (
          <div className="flex flex-col items-start gap-2 p-3 text-sm text-bad" role="alert">
            <span className="flex items-center gap-2"><Icon name="alertTriangle" size={15} />{error}</span>
            <Button size="sm" variant="outline" onClick={() => void load(listing?.path)}>Retry</Button>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 p-3 text-sm text-fg-muted"><Spinner size={13} />Loading…</div>
        ) : (listing?.dirs.length ?? 0) === 0 ? (
          <div className="p-3 text-sm text-fg-muted">No subfolders here.</div>
        ) : listing?.dirs.map((dir) => (
          <div role="option" aria-selected={false} key={dir.path}>
            <button
              type="button"
              className="folder-picker-row flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm hover:bg-hover focus-visible:bg-hover"
              onClick={() => void load(dir.path)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') { event.preventDefault(); step(1, event.currentTarget) }
                else if (event.key === 'ArrowUp') { event.preventDefault(); step(-1, event.currentTarget) }
              }}
            >
              <Icon name="folder" size={15} className="text-fg-muted" />
              <span className="min-w-0 flex-1 truncate">{dir.name}</span>
              <Icon name="chevronRight" size={14} className="text-fg-faint" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-5">
        <label className="sr-only" htmlFor="folder-picker-path">Absolute path</label>
        <input
          id="folder-picker-path"
          className="filter-input"
          value={manualPath}
          placeholder="…or paste an absolute path"
          aria-label="Open a folder by absolute path"
          onChange={(event) => setManualPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              const target = manualPath.trim()
              if (target !== '') void load(target)
            }
          }}
        />
        <Button size="sm" variant="outline" disabled={manualPath.trim() === ''} onClick={() => void load(manualPath.trim())}>Go</Button>
      </div>
      <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button size="sm" variant="ghost" onClick={onDismiss}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={listing === null || loading || error !== null} onClick={() => { if (listing !== null) onConfirm(listing.path) }}>
          Choose this folder
        </Button>
      </footer>
    </Modal>
  )
}
