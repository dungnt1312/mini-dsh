import { useEffect, useRef, useState } from 'react'
import { deleteWorkspace, renameWorkspace, setWorkspaceArchived } from '../../lib/api.ts'
import { useToast } from '../common/Toast.tsx'
import { ErrorNotice } from '../common/ErrorNotice.tsx'
import ConfirmDialog from '../common/ConfirmDialog.tsx'
import Icon from '../common/Icon.tsx'
import { Badge } from '../ui/Badge.tsx'
import { Menu } from '../ui/Menu.tsx'
import { TextInput } from '../ui/TextInput.tsx'
import type { WorkspaceRow } from '../../lib/types.ts'

type PendingAction = { readonly kind: 'archive' | 'delete'; readonly workspace: WorkspaceRow }

/**
 * Workspace switch + manage popover (spec: WorkspacePopover, 360px):
 * rows with danger-first badges and a hover action zone (inline rename +
 * kebab menu with Archive/Restore and Delete…). Destructive actions confirm
 * through the shared dialog; a 409 keeps it open with the server message.
 * No set-default control — the API does not offer one.
 */
export function WorkspacePopover({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onChanged,
  newWorkspaceName,
  onNewWorkspaceName,
  onCreate,
}: {
  readonly workspaces: readonly WorkspaceRow[]
  readonly activeWorkspaceId: string | null
  readonly onSelect: (id: string) => void
  readonly onChanged: () => Promise<void>
  readonly newWorkspaceName: string
  readonly onNewWorkspaceName: (value: string) => void
  readonly onCreate: () => void
}) {
  const toast = useToast()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [pendingError, setPendingError] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (renaming !== null) renameInputRef.current?.focus()
  }, [renaming])

  const commitRename = async (): Promise<void> => {
    if (renaming === null || busy) return
    const name = renameDraft.trim()
    if (name === '') return
    setBusy(true)
    setRenameError(null)
    try {
      await renameWorkspace(renaming, name)
      await onChanged()
      toast.notify('Workspace renamed.', 'ok')
      setRenaming(null)
    } catch (cause) {
      setRenameError(String(cause))
    } finally {
      setBusy(false)
    }
  }

  const runPending = async (): Promise<void> => {
    if (pending === null || busy) return
    setBusy(true)
    setPendingError(null)
    try {
      if (pending.kind === 'archive') {
        const next = !pending.workspace.archived
        await setWorkspaceArchived(pending.workspace.id, next)
        toast.notify(next ? 'Workspace archived.' : 'Workspace restored.', 'ok')
      } else {
        await deleteWorkspace(pending.workspace.id)
        toast.notify('Workspace deleted.', 'ok')
      }
      await onChanged()
      setPending(null)
    } catch (cause) {
      // Keep the dialog open: the server message is the decision context.
      setPendingError(String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="ws-picker">
        {workspaces.map((row) => (
          <div key={row.id} className={`ws-row-shell ${row.id === activeWorkspaceId ? 'ws-row-active' : ''}`}>
            {renaming === row.id ? (
              <form
                className="ws-rename"
                onSubmit={(event) => {
                  event.preventDefault()
                  void commitRename()
                }}
              >
                <TextInput
                  ref={renameInputRef}
                  aria-label="Workspace name"
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation()
                      setRenaming(null)
                    }
                  }}
                />
                <button type="submit" className="ws-row-action" aria-label="Save workspace name" disabled={busy || renameDraft.trim() === ''}>
                  <Icon name="check" size={12} />
                </button>
                <button type="button" className="ws-row-action" aria-label="Cancel rename" onClick={() => setRenaming(null)}>
                  <Icon name="close" size={12} />
                </button>
                {renameError !== null ? <ErrorNotice raw={renameError} /> : null}
              </form>
            ) : (
              <>
                <button
                  type="button"
                  className="ws-row"
                  onClick={() => {
                    onSelect(row.id)
                  }}
                >
                  <span className="ws-row-name">{row.name}</span>
                  {(row.approvals ?? 0) > 0 ? <Badge tone="amber">{row.approvals} awaiting approval</Badge> : null}
                  {(row.running ?? 0) > 0 ? <Badge tone="green">{row.running} running</Badge> : null}
                  {row.archived ? <Badge tone="gray">archived</Badge> : null}
                  {row.default === true ? <Badge tone="gray">default</Badge> : null}
                </button>
                <span className="ws-row-zone">
                  <button
                    type="button"
                    className="ws-row-action"
                    aria-label={`Rename ${row.name}`}
                    onClick={() => {
                      setRenameDraft(row.name)
                      setRenameError(null)
                      setRenaming(row.id)
                    }}
                  >
                    <Icon name="pencil" size={12} />
                  </button>
                  <Menu
                    label={`Manage ${row.name}`}
                    panelClassName="ws-menu"
                    triggerClassName="ws-row-action"
                    trigger={() => <Icon name="dots" size={13} />}
                  >
                    {(close) => (
                      <>
                        <button type="button" role="menuitem" className="menu-row" onClick={() => { close(); setRenameDraft(row.name); setRenaming(row.id) }}>
                          Rename
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="menu-row"
                          disabled={(row.running ?? 0) > 0}
                          title={(row.running ?? 0) > 0 ? 'Stop running sessions first' : undefined}
                          onClick={() => { close(); setPendingError(null); setPending({ kind: 'archive', workspace: row }) }}
                        >
                          <Icon name="archive" size={12} />
                          {row.archived ? 'Restore' : 'Archive'}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="menu-row ws-menu-danger"
                          onClick={() => { close(); setPendingError(null); setPending({ kind: 'delete', workspace: row }) }}
                        >
                          Delete…
                        </button>
                      </>
                    )}
                  </Menu>
                </span>
              </>
            )}
          </div>
        ))}
        {workspaces.length === 0 ? <span className="ws-empty">No workspaces</span> : null}
      </div>
      <form
        className="topbar-folder-pop-form"
        onSubmit={(event) => {
          event.preventDefault()
          onCreate()
        }}
      >
        <TextInput
          leading={<Icon name="plus" size={13} />}
          value={newWorkspaceName}
          placeholder="New workspace…"
          onChange={(event) => onNewWorkspaceName(event.target.value)}
        />
        <button type="submit" className="ws-create-btn">Create</button>
      </form>
      {pending !== null ? (
        <ConfirmDialog
          open
          title={pending.kind === 'archive'
            ? `${pending.workspace.archived ? 'Restore' : 'Archive'} "${pending.workspace.name}"?`
            : `Delete "${pending.workspace.name}"?`}
          confirmLabel={pending.kind === 'archive' ? (pending.workspace.archived ? 'Restore' : 'Archive') : 'Delete'}
          busy={busy}
          onConfirm={() => void runPending()}
          onDismiss={() => { if (!busy) setPending(null) }}
          body={(
            <>
              {pending.kind === 'archive'
                ? <p>Archived workspaces remain in the switcher but stop accepting new sessions and projects. Existing conversations are kept.</p>
                : <p>Only empty workspaces can be deleted. A workspace with conversations or projects answers with the reason below instead of deleting anything.</p>}
              {pendingError !== null ? <ErrorNotice raw={pendingError} /> : null}
            </>
          )}
        />
      ) : null}
    </>
  )
}
