import type { ReactNode } from 'react'
import Icon from '../common/Icon.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { ArtifactsPanel, type OpenPathResolver } from '../artifacts/ArtifactsPanel.tsx'
import { ContextPanel, type ContextPanelProps } from '../layout/ContextPanel.tsx'
import { FileBrowser } from './FileBrowser.tsx'
import { FileViewer } from './FileViewer.tsx'
import { baseName } from '../../lib/project-paths.ts'
import { fileStyle } from '../../lib/file-icons.ts'
import { cn } from '../../lib/cn.ts'
import type { WorkbenchFiles } from '../../hooks/useWorkbenchFiles.ts'
import type { SseEvent } from '../../lib/types.ts'

export type WorkbenchView = 'files' | 'context' | 'artifacts'

export interface WorkbenchProject {
  readonly id: string
  readonly name: string
  readonly path: string
}

const tabClass = 'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-fg-muted transition-colors hover:bg-hover hover:text-fg'

function ViewTab({ active, icon, label, onClick }: { readonly active: boolean; readonly icon: 'folder' | 'info' | 'layers'; readonly label: string; readonly onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn(tabClass, active && 'bg-muted text-fg')}>
      <Icon name={icon} size={15} />
      {label}
    </button>
  )
}

/**
 * The workbench: fixed Files / Context / Artifacts views plus one closable tab
 * per opened file. Everything here is read-only; file bodies come from the
 * project browsing endpoints and never from tool output.
 */
export function Workbench({ workspaceId, project, view, onView, files, context, events, expanded, onToggleExpand, onClose, openPath }: {
  readonly workspaceId: string | null
  /** The project whose files are browsable; null for chat-only conversations. */
  readonly project: WorkbenchProject | null
  readonly view: WorkbenchView
  readonly onView: (view: WorkbenchView) => void
  readonly files: WorkbenchFiles
  readonly context: ContextPanelProps
  readonly events: readonly SseEvent[]
  readonly expanded: boolean
  readonly onToggleExpand?: () => void
  readonly onClose: () => void
  readonly openPath?: OpenPathResolver
}) {
  const showFile = files.activeFile !== null && project !== null && workspaceId !== null
  const selectView = (next: WorkbenchView): void => {
    files.showFixedView()
    onView(next)
  }

  let body: ReactNode
  if (showFile) {
    body = <FileViewer key={`${project.id}:${files.activeFile}`} workspaceId={workspaceId} projectId={project.id} projectPath={project.path} path={files.activeFile!} />
  } else if (view === 'files') {
    body = project !== null && workspaceId !== null
      ? <FileBrowser key={project.id} workspaceId={workspaceId} project={project} folder={files.folder} activeFile={files.activeFile} onFolder={files.setFolder} onOpenFile={files.openFile} />
      : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <Icon name="folder" size={22} className="text-fg-faint" />
            <p className="m-0 text-sm font-medium">No project folder for this conversation</p>
            <p className="m-0 max-w-xs text-[13px] text-fg-muted">Start a conversation in a project to browse its files here. Context and Artifacts remain available.</p>
          </div>
        )
  } else if (view === 'context') {
    body = <div className="min-h-0 flex-1 overflow-y-auto p-4"><ContextPanel {...context} /></div>
  } else {
    body = <div className="min-h-0 flex-1 overflow-y-auto p-4"><ArtifactsPanel events={events} {...(openPath !== undefined ? { openPath } : {})} /></div>
  }

  return (
    <section aria-label="Workbench" className="flex h-full min-h-0 w-full flex-col bg-bg text-fg">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line pl-2 pr-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" role="toolbar" aria-label="Workbench views">
          <ViewTab active={!showFile && view === 'files'} icon="folder" label="Files" onClick={() => selectView('files')} />
          <ViewTab active={!showFile && view === 'context'} icon="info" label="Context" onClick={() => selectView('context')} />
          <ViewTab active={!showFile && view === 'artifacts'} icon="layers" label="Artifacts" onClick={() => selectView('artifacts')} />
          {files.openFiles.length > 0 ? <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" /> : null}
            {files.openFiles.map((path) => {
              const active = files.activeFile === path
              const icon = fileStyle(path)
              return (
                <span key={path} className={cn('group flex h-8 shrink-0 items-center rounded-lg', active ? 'bg-muted' : 'hover:bg-hover')}>
                  <button type="button" aria-pressed={active} title={path} onClick={() => files.openFile(path)} className={cn('flex h-full items-center gap-1.5 pl-2.5 pr-1 text-[13px]', active ? 'text-fg' : 'text-fg-muted hover:text-fg')}>
                    <Icon name={icon.name} size={14} className={icon.className} />
                  <span className="max-w-[10rem] truncate">{baseName(path)}</span>
                </button>
                <button type="button" aria-label={`Close ${path}`} title="Close" onClick={() => files.closeFile(path)} className="mr-1 flex size-5 items-center justify-center rounded text-fg-faint hover:bg-hover hover:text-fg">
                  <Icon name="close" size={12} />
                </button>
              </span>
            )
          })}
        </div>
        {onToggleExpand !== undefined ? (
          <IconButton label={expanded ? 'Exit full width' : 'Expand workbench'} onClick={onToggleExpand}>
            <Icon name={expanded ? 'minimize' : 'maximize'} size={16} />
          </IconButton>
        ) : null}
        <IconButton label="Hide workbench" onClick={onClose}><Icon name="close" size={17} /></IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    </section>
  )
}
