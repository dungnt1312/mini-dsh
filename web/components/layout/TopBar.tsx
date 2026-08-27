import { useEffect, useRef, useState, type FormEvent } from 'react'
import Icon from '../common/Icon.tsx'
import { Badge } from '../ui/Badge.tsx'
import { Button } from '../ui/Button.tsx'
import { Chip } from '../ui/Chip.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { TextInput } from '../ui/TextInput.tsx'
import { SHOW_SLOTS } from '../../lib/config.ts'
import { pathBasename } from '../../lib/format.ts'
import type { StreamState } from '../../lib/api.ts'
import type { Meta } from '../../lib/types.ts'

/**
 * Global chrome: brand + workspace-folder switcher, centered session title
 * with provider chip, right cluster of layout toggles. The folder popover
 * posts through App's applyFolder so REST errors surface as toasts there.
 */
export function TopBar({
  title,
  meta,
  stream,
  sidebarOpen,
  folderDraft,
  onFolderDraft,
  onApplyFolder,
  onToggleSidebar,
  onToggleEnv,
}: {
  readonly title: string
  readonly meta: Meta | null
  readonly stream: StreamState
  readonly sidebarOpen: boolean
  readonly folderDraft: string
  readonly onFolderDraft: (value: string) => void
  readonly onApplyFolder: () => void
  readonly onToggleSidebar: () => void
  readonly onToggleEnv: () => void
}) {
  const [folderOpen, setFolderOpen] = useState(false)
  const popRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!folderOpen) return
    const onDown = (event: MouseEvent): void => {
      if (popRef.current !== null && !popRef.current.contains(event.target as Node)) setFolderOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setFolderOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [folderOpen])

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (folderDraft.trim() === '') return
    onApplyFolder()
    setFolderOpen(false)
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-logo" aria-hidden="true">⌬</span>
        <div className="topbar-workspace" ref={popRef}>
          <Chip interactive caret onClick={() => setFolderOpen((prev) => !prev)} title="Đổi workspace folder">
            <span className={`ws-dot ws-dot-${stream}`} aria-hidden="true" />
            <b>{meta !== null ? pathBasename(meta.folder) : 'workspace'}</b>
          </Chip>
          {folderOpen ? (
            <form className="topbar-folder-pop" onSubmit={submit}>
              <TextInput
                autoFocus
                leading={<Icon name="folder" size={13} />}
                value={folderDraft}
                placeholder="/path/to/workspace"
                onChange={(event) => onFolderDraft(event.target.value)}
              />
              <Button variant="primary" size="sm" disabled={folderDraft.trim() === ''}>
                Dùng
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="topbar-center">
        <h1 className="topbar-title">{title || 'untitled session'}</h1>
        {meta !== null ? (
          <span className="topbar-path-chip">
            <Chip title={meta.folder}>
              <Icon name="folder" size={11} />
              {meta.folder}
            </Chip>
          </span>
        ) : null}
        {meta !== null ? (
          <Chip title="LLM provider">
            <Icon name="zap" size={11} className="accent-icon" />
            {meta.provider}
          </Chip>
        ) : null}
      </div>

      <div className="topbar-actions">
        <IconButton label="Environment panel" size="md" onClick={onToggleEnv}>
          <Icon name="sliders" size={15} />
        </IconButton>
        <IconButton label={sidebarOpen ? 'Đóng danh sách phiên' : 'Danh sách phiên'} size="md" onClick={onToggleSidebar}>
          <Icon name="panelLeft" size={15} />
        </IconButton>
        {SHOW_SLOTS ? (
          <>
            <IconButton label="File browser — sắp ra mắt" size="md" variant="outline" className="ui-icon-btn-slot" disabled>
              <Icon name="fileText" size={15} />
            </IconButton>
            <IconButton label="Side panel — sắp ra mắt" size="md" variant="outline" className="ui-icon-btn-slot" disabled>
              <Icon name="panelRight" size={15} />
            </IconButton>
            <Badge tone="amber">slot sau</Badge>
          </>
        ) : null}
      </div>
    </header>
  )
}
