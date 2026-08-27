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
 * Global chrome: a session-scoped workspace switcher, centered conversation
 * context, layout toggles, and the provider Settings entry point. Folder
 * submission deliberately allows an empty value: that resets this session to
 * the server's default workspace instead of modifying any other chat.
 */
export function TopBar({
  title,
  meta,
  stream,
  sidebarOpen,
  sessionFolder,
  folderDraft,
  canSetFolder,
  onFolderDraft,
  onApplyFolder,
  onToggleSidebar,
  onToggleEnv,
  onOpenSettings,
}: {
  readonly title: string
  readonly meta: Meta | null
  readonly stream: StreamState
  readonly sidebarOpen: boolean
  readonly sessionFolder: string | null
  readonly folderDraft: string
  readonly canSetFolder: boolean
  readonly onFolderDraft: (value: string) => void
  readonly onApplyFolder: () => void
  readonly onToggleSidebar: () => void
  readonly onToggleEnv: () => void
  readonly onOpenSettings: () => void
}) {
  const [folderOpen, setFolderOpen] = useState(false)
  const popRef = useRef<HTMLDivElement | null>(null)
  const resolvedFolder = sessionFolder ?? meta?.folder ?? ''

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
    if (!canSetFolder) return
    onApplyFolder()
    setFolderOpen(false)
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-logo" aria-hidden="true">⌬</span>
        <div className="topbar-workspace" ref={popRef}>
          <Chip
            interactive={canSetFolder}
            caret={canSetFolder}
            onClick={() => setFolderOpen((prev) => !prev)}
            title={canSetFolder ? 'Đổi workspace của session này' : 'Chọn một session trước'}
          >
            <span className={`ws-dot ws-dot-${stream}`} aria-hidden="true" />
            <b>{resolvedFolder === '' ? 'workspace' : pathBasename(resolvedFolder)}</b>
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
              <Button variant="primary" size="sm">
                Dùng
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onFolderDraft('')}>
                Inherit
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="topbar-center">
        <h1 className="topbar-title">{title || 'untitled session'}</h1>
        {resolvedFolder !== '' ? (
          <span className="topbar-path-chip">
            <Chip title={sessionFolder === null ? 'Inherited default workspace' : 'Session workspace'}>
              <Icon name="folder" size={11} />
              {resolvedFolder}
            </Chip>
          </span>
        ) : null}
        {meta !== null && meta.provider !== '' ? (
          <Chip title="Active LLM provider">
            <Icon name="zap" size={11} className="accent-icon" />
            {meta.provider}
          </Chip>
        ) : null}
      </div>

      <div className="topbar-actions">
        <IconButton label="Mở provider settings" size="md" onClick={onOpenSettings}>
          <Icon name="sliders" size={15} />
        </IconButton>
        <IconButton label="Environment panel" size="md" onClick={onToggleEnv}>
          <Icon name="panelRight" size={15} />
        </IconButton>
        <IconButton label={sidebarOpen ? 'Đóng danh sách phiên' : 'Danh sách phiên'} size="md" onClick={onToggleSidebar}>
          <Icon name="panelLeft" size={15} />
        </IconButton>
        {SHOW_SLOTS ? (
          <>
            <IconButton label="File browser — sắp ra mắt" size="md" variant="outline" className="ui-icon-btn-slot" disabled>
              <Icon name="fileText" size={15} />
            </IconButton>
            <Badge tone="amber">slot sau</Badge>
          </>
        ) : null}
      </div>
    </header>
  )
}
