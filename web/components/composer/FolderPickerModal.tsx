import { useCallback, useEffect, useRef, useState } from 'react'
import { listDirs, type FolderListing } from '../../lib/api.ts'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Modal } from '../ui/Modal.tsx'
import Icon from '../common/Icon.tsx'

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
      className="folder-picker"
      header={
        <>
          <span className="folder-picker-title">
            <strong>Choose a project folder</strong>
            <small>The folder registers as a project; the conversation is created by your first message.</small>
          </span>
          <IconButton label="Close folder picker" size="md" onClick={onDismiss}>
            <Icon name="close" size={15} />
          </IconButton>
        </>
      }
    >
      <div className="folder-picker-bar">
        <Button
          size="sm"
          variant="ghost"
          className="folder-picker-up"
          aria-label="Go to parent folder"
          disabled={listing?.parent === null || listing === null}
          title={listing?.parent ?? undefined}
          onClick={() => { if (listing?.parent !== null && listing !== null) void load(listing.parent) }}
        >
          <Icon name="chevron" size={12} className="icon-flip" />
        </Button>
        <span className="folder-picker-path" title={listing?.path ?? undefined}>{listing?.path ?? (loading ? 'Loading…' : '—')}</span>
      </div>
      <div className="folder-picker-list" role="list">
        {error !== null ? (
          <div className="folder-picker-row folder-picker-error" role="alert">
            <Icon name="alertTriangle" size={13} />
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void load(listing?.path)}>Retry</Button>
          </div>
        ) : loading ? (
          <div className="folder-picker-row folder-picker-muted">Loading…</div>
        ) : (listing?.dirs.length ?? 0) === 0 ? (
          <div className="folder-picker-row folder-picker-muted">No subfolders here.</div>
        ) : listing?.dirs.map((dir) => (
          <div className="folder-picker-row-wrap" role="listitem" key={dir.path}>
            <button
              type="button"
              className="folder-picker-row"
              onClick={() => void load(dir.path)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') { event.preventDefault(); step(1, event.currentTarget) }
                else if (event.key === 'ArrowUp') { event.preventDefault(); step(-1, event.currentTarget) }
              }}
            >
              <Icon name="folder" size={13} />
              <span className="folder-picker-name">{dir.name}</span>
              <Icon name="chevronRight" size={11} className="folder-picker-go" />
            </button>
          </div>
        ))}
      </div>
      <div className="folder-picker-manual">
        <input
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
      <footer className="folder-picker-actions">
        <Button size="sm" variant="ghost" onClick={onDismiss}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={listing === null || loading || error !== null} onClick={() => { if (listing !== null) onConfirm(listing.path) }}>
          Choose this folder
        </Button>
      </footer>
    </Modal>
  )
}
