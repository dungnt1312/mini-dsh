import { useEffect, useRef } from 'react'
import { useScopedState } from '../../hooks/useScopedState.ts'
import { createProject, renameProject, removeProject, setProjectPath } from '../../lib/api.ts'
import type { ProjectRow } from '../../lib/types.ts'
import { Button } from '../ui/Button.tsx'
import { Field } from '../ui/Field.tsx'
import { TextInput } from '../ui/TextInput.tsx'
import { ErrorNotice } from '../common/ErrorNotice.tsx'

export function ProjectsPanel(props: {
  readonly workspaceId: string | null
  readonly projects: readonly ProjectRow[]
  readonly onChanged: () => Promise<void>
  readonly sessionCounts?: Readonly<Record<string, number>>
}) {
  return <ProjectsPanelContent key={props.workspaceId} {...props} />
}

function ProjectsPanelContent({ workspaceId, projects, onChanged, sessionCounts = {} }: {
  readonly workspaceId: string | null
  readonly projects: readonly ProjectRow[]
  readonly onChanged: () => Promise<void>
  readonly sessionCounts?: Readonly<Record<string, number>>
}) {
  const [name, setName] = useScopedState('')
  const [path, setPath] = useScopedState('')
  const [busy, setBusy] = useScopedState(false)
  const lock = useRef(false)
  const [error, setError] = useScopedState<string | null>(null)
  const [saved, setSaved] = useScopedState(false)
  const [editing, setEditing] = useScopedState<string | null>(null)
  const [editName, setEditName] = useScopedState('')
  const [retargeting, setRetargeting] = useScopedState<string | null>(null)
  const [editPath, setEditPath] = useScopedState('')
  const [rowErrors, setRowErrors] = useScopedState<Record<string, string>>({})
  const [removing, setRemoving] = useScopedState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false; lock.current = false }, [])
  const mutate = async (projectId: string, action: () => Promise<unknown>) => {
    if (lock.current || !workspaceId) return
    lock.current = true; setBusy(true); setError(null); setRowErrors((all) => ({ ...all, [projectId]: '' }))
    try { await action(); if (!alive.current) return; await onChanged(); if (!alive.current) return; setEditing(null); setRemoving(null); setRetargeting(null) }
    catch (cause) { setRowErrors((all) => ({ ...all, [projectId]: String(cause) })) }
    finally { lock.current = false; setBusy(false) }
  }
  const register = async () => {
    if (!workspaceId || !path.trim() || lock.current) return
    lock.current = true; setBusy(true); setError(null); setSaved(false)
    try {
      await createProject(workspaceId, name.trim() || path.trim().split(/[\\/]/).filter(Boolean).at(-1) || path.trim(), path.trim())
      if (!alive.current) return
      await onChanged()
      if (!alive.current) return
      setPath(''); setName(''); setSaved(true)
    } catch (cause) { setError(String(cause)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="manage-panel">
    <section className="manage-section"><h2>Registered projects</h2><p className="manage-hint">A project is a filesystem root in this workspace. Registration never changes the scope of an existing conversation.</p>
      {projects.length ? <ul className="manage-list">{projects.map(project => {
        const count = sessionCounts[project.id] ?? 0
        return <li className="manage-server" key={project.id}><div><strong>{project.name}</strong><span className="project-sessions">{count} {count === 1 ? 'conversation' : 'conversations'}</span><p className="project-path"><code>{project.path}</code></p></div><div className="manage-actions">
          {retargeting === project.id ? <><TextInput aria-label="New project folder" value={editPath} onChange={event => setEditPath(event.target.value)} /><Button disabled={busy || !editPath.trim()} onClick={() => void mutate(project.id, () => setProjectPath(workspaceId!, project.id, editPath.trim()))}>Save path</Button><Button disabled={busy} onClick={() => setRetargeting(null)}>Cancel</Button></> : <Button disabled={busy} onClick={() => { setRetargeting(project.id); setEditPath(project.path) }}>Change folder</Button>}
          {editing === project.id ? <><TextInput aria-label="New project name" value={editName} onChange={event => setEditName(event.target.value)} /><Button disabled={busy || !editName.trim()} onClick={() => void mutate(project.id, () => renameProject(workspaceId!, project.id, editName.trim()))}>Save name</Button><Button disabled={busy} onClick={() => setEditing(null)}>Cancel</Button></> : <Button disabled={busy} onClick={() => { setEditing(project.id); setEditName(project.name) }}>Rename</Button>}
          {removing === project.id ? <><p>Remove this registration? Files stay on disk. Removal is refused while any conversation is bound to this project.</p><Button variant="outline-danger" disabled={busy} onClick={() => void mutate(project.id, () => removeProject(workspaceId!, project.id))}>Remove registration</Button><Button disabled={busy} onClick={() => setRemoving(null)}>Cancel removal</Button></> : <Button disabled={busy} onClick={() => setRemoving(project.id)}>Remove project</Button>}
        </div>
        {rowErrors[project.id] ? <ErrorNotice raw={rowErrors[project.id]!} /> : null}
      </li>})}</ul> : <p>No projects registered yet.</p>}
    </section>
    <form className="manage-section" onSubmit={event => { event.preventDefault(); void register() }} aria-busy={busy}>
      <h2>Register a folder</h2><Field label="Project name" hint="Optional. Defaults to the folder name."><TextInput value={name} onChange={event => setName(event.target.value)} disabled={busy} /></Field>
      <Field label="Project folder" hint="Use an existing absolute path on the server. Overlapping roots remain subject to server validation."><TextInput value={path} onChange={event => setPath(event.target.value)} placeholder="C:/workspace/project" disabled={busy} /></Field>
      {error ? <ErrorNotice raw={error} /> : null}{saved ? <p role="status">Project registered. Start a new conversation to use it.</p> : null}
      <div className="manage-actions"><Button type="submit" variant="primary" disabled={busy || !workspaceId || !path.trim()}>{busy ? 'Registering…' : 'Register project'}</Button></div>
    </form>
  </div>
}
