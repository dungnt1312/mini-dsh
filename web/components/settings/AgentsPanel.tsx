import { useCallback, useEffect, useMemo } from 'react'
import { useScopedState } from '../../hooks/useScopedState.ts'
import Icon from '../common/Icon.tsx'
import { Badge } from '../ui/Badge.tsx'
import { Button } from '../ui/Button.tsx'
import { Field } from '../ui/Field.tsx'
import { Segmented } from '../ui/Segmented.tsx'
import { TextInput } from '../ui/TextInput.tsx'
import {
  cancelChild,
  deleteAgentDefinition,
  importAgentDefinition,
  listAgentDefinitions,
  listChildren,
  spawnChild,
} from '../../lib/api.ts'
import { cn } from '../../lib/cn.ts'
import type { AgentDefinitionRow, ChildRow } from '../../lib/types.ts'
import {
  CodeArea,
  EmptyState,
  InlineConfirm,
  ItemList,
  ItemRow,
  Notice,
  PanelBody,
  PanelIntro,
  Section,
  WorkspaceRequired,
  useActionRunner,
  type NoticeState,
} from './settings-kit.tsx'

const CHILD_TONE: Readonly<Record<ChildRow['status'], 'green' | 'blue' | 'amber' | 'gray'>> = {
  running: 'blue',
  completed: 'green',
  failed: 'amber',
  cancelled: 'gray',
  interrupted: 'amber',
}

const IMPORT_PLACEHOLDER = '---\ndescription: "reviews code"\ntools: ["Read", "Grep"]\n---\n\nReview carefully.'

const linesToArray = (raw: string): string[] => raw.split('\n').map((line) => line.trim()).filter((line) => line !== '')

/**
 * Agent roles + bounded one-level delegation. A role restricts the child's
 * tools; it never grants the workspace policy or the mode ceiling anything.
 */
export function AgentsPanel(props: { readonly workspaceId: string | null; readonly rootSessionId: string | null; readonly onOpenChild?: (childSessionId: string) => void }) {
  // Scope changes remount before paint: no A data or drafts can be acted on in B.
  return <AgentsPanelContent key={JSON.stringify([props.workspaceId, props.rootSessionId])} {...props} />
}

function AgentsPanelContent({ workspaceId, rootSessionId, onOpenChild }: { readonly workspaceId: string | null; readonly rootSessionId: string | null; readonly onOpenChild?: (childSessionId: string) => void }) {
  const [definitions, setDefinitions] = useScopedState<readonly AgentDefinitionRow[]>([])
  const [children, setChildren] = useScopedState<readonly ChildRow[]>([])
  const [selected, setSelected] = useScopedState<string>('explorer')
  const [objective, setObjective] = useScopedState('')
  const [constraints, setConstraints] = useScopedState('')
  const [references, setReferences] = useScopedState('')
  const [requiredResult, setRequiredResult] = useScopedState('bounded summary with file references')
  const [grants, setGrants] = useScopedState('')
  const [notice, setNotice] = useScopedState<NoticeState>(null)
  const [confirmDelete, setConfirmDelete] = useScopedState(false)
  const [importName, setImportName] = useScopedState('')
  const [importContent, setImportContent] = useScopedState('')
  const [importDialect, setImportDialect] = useScopedState<'claude' | 'codex'>('claude')
  const [importVersion, setImportVersion] = useScopedState('')
  const { busy, run } = useActionRunner((text) => setNotice({ kind: 'bad', text }))

  const refreshChildren = useCallback(async () => {
    if (workspaceId === null || rootSessionId === null) return
    try { setChildren(await listChildren(workspaceId, rootSessionId)) }
    catch (cause) { setNotice({ kind: 'bad', text: String(cause) }) }
  }, [workspaceId, rootSessionId])

  const refreshDefinitions = useCallback(async () => {
    if (workspaceId === null) return
    try { setDefinitions(await listAgentDefinitions(workspaceId)) }
    catch (cause) { setNotice({ kind: 'bad', text: String(cause) }) }
  }, [workspaceId])

  useEffect(() => { void refreshDefinitions() }, [refreshDefinitions])
  useEffect(() => { void refreshChildren() }, [refreshChildren])

  // Poll only while a child runs; polling stops by itself when none do.
  useEffect(() => {
    if (workspaceId === null || rootSessionId === null) return
    if (!children.some((child) => child.status === 'running')) return
    const timer = window.setInterval(() => { void refreshChildren() }, 3000)
    return () => { window.clearInterval(timer) }
  }, [children, workspaceId, rootSessionId, refreshChildren])

  const current = useMemo(() => definitions.find((row) => row.definition.name === selected), [definitions, selected])

  if (workspaceId === null) return <WorkspaceRequired />

  const spawn = (): Promise<void> => run('spawn', async () => {
    if (rootSessionId === null || objective.trim() === '') return
    const handle = await spawnChild(
      workspaceId,
      selected,
      rootSessionId,
      {
        objective: objective.trim(),
        constraints: linesToArray(constraints),
        references: linesToArray(references),
        requiredResult: requiredResult.trim() === '' ? 'bounded summary' : requiredResult.trim(),
      },
      linesToArray(grants),
    )
    setNotice({ kind: 'ok', text: `Spawned ${handle.definitionName} (${handle.childSessionId.slice(0, 12)}…)` })
    setObjective('')
    await refreshChildren()
  })

  const removeDefinition = (name: string): Promise<void> => run('delete', async () => {
    await deleteAgentDefinition(workspaceId, name)
    setConfirmDelete(false)
    setSelected('explorer')
    setNotice({ kind: 'ok', text: `Deleted ${name}.` })
    await refreshDefinitions()
  })

  const cancel = (child: ChildRow): Promise<void> => run(`cancel:${child.childSessionId}`, async () => {
    try { await cancelChild(workspaceId, child.childSessionId) }
    finally { await refreshChildren() }
  })

  const codexNeedsVersion = importDialect === 'codex' && importVersion.trim() === ''
  const importDefinition = (): Promise<void> => run('import', async () => {
    const name = importName.trim()
    const result = await importAgentDefinition(workspaceId, name, {
      content: importContent,
      dialect: importDialect,
      ...(importDialect === 'codex' ? { sourceVersion: importVersion.trim() } : {}),
    })
    await refreshDefinitions()
    setSelected(name)
    setImportName('')
    setImportContent('')
    setNotice({
      kind: 'ok',
      text: `Imported ${result.imported.join(', ')}${result.blocked !== undefined && result.blocked.length > 0 ? ` — blocked: ${result.blocked.join(', ')}` : ''}`,
    })
  })

  const noConversation = rootSessionId === null

  return (
    <PanelBody>
      <PanelIntro>
        One level of delegation: only the root can spawn children. Up to 3 children run concurrently, with 8 per turn.
        A role narrows the child's tools; it never grants more than the workspace allows.
      </PanelIntro>
      {notice !== null ? <Notice kind={notice.kind} text={notice.text} /> : null}

      <Section title="Roles" count={definitions.length}>
        {definitions.length === 0 ? <EmptyState>No agent definitions in this workspace.</EmptyState> : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Agent roles">
            {definitions.map((row) => {
              const isSelected = row.definition.name === selected
              return (
                <button
                  key={row.definition.name}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => { setSelected(row.definition.name); setConfirmDelete(false) }}
                  className={cn(
                    'flex min-w-0 flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors hover:bg-hover',
                    isSelected ? 'border-fg bg-hover' : 'border-line',
                  )}
                >
                  <span className="flex w-full min-w-0 items-center gap-2 text-sm font-medium">
                    <span className="truncate">{row.definition.name}</span>
                    <Badge tone={row.source === 'workspace' ? 'blue' : 'gray'}>{row.source}</Badge>
                  </span>
                  <span className="line-clamp-2 text-xs text-fg-muted">{row.definition.description}</span>
                  <span className="text-xs text-fg-faint">{row.definition.tools.length > 0 ? `${row.definition.tools.length} tools` : 'All allowed tools'}</span>
                </button>
              )
            })}
          </div>
        )}
        {current !== undefined ? (
          <div className="flex flex-col gap-2 rounded-xl bg-muted px-3.5 py-3 text-[13px]">
            <p className="m-0 text-fg-muted">
              <span className="font-medium text-fg">{current.definition.name}</span>
              {' · '}tools: {current.definition.tools.length > 0 ? current.definition.tools.join(', ') : 'all allowed'}
              {current.definition.disallowedTools.length > 0 ? <> · always denied: {current.definition.disallowedTools.join(', ')}</> : null}
            </p>
            <details>
              <summary className="cursor-pointer text-xs text-fg-muted">View definition JSON</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-surface p-3 font-mono text-xs">{JSON.stringify(current.definition, null, 2)}</pre>
            </details>
            {current.source === 'workspace' ? (
              confirmDelete ? (
                <InlineConfirm
                  message="Delete this workspace definition? Existing child results remain."
                  confirmLabel="Delete definition"
                  cancelLabel="Cancel deletion"
                  busy={busy === 'delete'}
                  onConfirm={() => void removeDefinition(current.definition.name)}
                  onCancel={() => setConfirmDelete(false)}
                />
              ) : (
                <Button variant="outline-danger" size="sm" className="self-start" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
                  <Icon name="trash" size={13} />Delete selected agent
                </Button>
              )
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section title={`Spawn ${selected}`}>
        {noConversation ? <Notice kind="info" text="No conversation selected — open a conversation to spawn child agents from it." /> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Objective" hint="The child receives only this task packet, not the root conversation history.">
              <TextInput value={objective} placeholder="Investigate why the build is slow" disabled={noConversation} onChange={(e) => setObjective(e.target.value)} />
            </Field>
          </div>
          <Field label="Constraints" hint="One constraint per line.">
            <CodeArea value={constraints} disabled={noConversation} onChange={(e) => setConstraints(e.target.value)} />
          </Field>
          <Field label="References" hint="One reference path or note per line.">
            <CodeArea value={references} disabled={noConversation} onChange={(e) => setReferences(e.target.value)} />
          </Field>
          <Field label="Required result">
            <TextInput value={requiredResult} disabled={noConversation} onChange={(e) => setRequiredResult(e.target.value)} />
          </Field>
          <Field label="Explicit tool grants" hint="One tool per line. Grants only narrow the definition; MCP tools always require an explicit grant.">
            <CodeArea rows={2} value={grants} disabled={noConversation} onChange={(e) => setGrants(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" disabled={busy !== null || noConversation || objective.trim() === ''} onClick={() => void spawn()}>
            <Icon name="plus" size={14} />{busy === 'spawn' ? 'Spawning…' : `Spawn ${selected}`}
          </Button>
        </div>
      </Section>

      <Section
        title="Children"
        count={children.length}
        actions={noConversation ? undefined : <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void refreshChildren()}><Icon name="refresh" size={13} />Refresh</Button>}
      >
        {children.length === 0 ? <EmptyState>No child agents for the current conversation.</EmptyState> : (
          <ItemList label="Child agents">
            {children.map((child) => (
              <ItemRow
                key={child.childSessionId}
                title={<><span>{child.definitionName}</span><Badge tone={CHILD_TONE[child.status]}>{child.status}</Badge></>}
                meta={<code className="font-mono">{child.childSessionId.slice(0, 14)}…</code>}
                actions={
                  <>
                    {onOpenChild !== undefined ? <Button variant="ghost" size="sm" onClick={() => onOpenChild(child.childSessionId)}>Open<Icon name="chevronRight" size={13} /></Button> : null}
                    {child.status === 'running' ? (
                      <Button variant="outline-danger" size="sm" disabled={busy !== null} onClick={() => void cancel(child)}>
                        {busy === `cancel:${child.childSessionId}` ? 'Cancelling…' : 'Cancel'}
                      </Button>
                    ) : null}
                  </>
                }
              >
                {child.error !== undefined ? <p className="m-0 text-[13px] text-bad">{child.error}</p> : null}
                {child.result !== undefined ? (
                  <div className="flex flex-col gap-1 text-[13px] text-fg-muted">
                    <p className="m-0 whitespace-pre-wrap">{child.result.summary}</p>
                    {child.result.fileReferences.length > 0 ? <p className="m-0 text-xs text-fg-faint">Files: {child.result.fileReferences.join(', ')}</p> : null}
                  </div>
                ) : null}
              </ItemRow>
            ))}
          </ItemList>
        )}
      </Section>

      <Section title="Import a definition">
        <PanelIntro>
          Imports record provenance and never run content automatically. Unsupported security fields (hooks, mcpServers, isolation…)
          block activation and return an error.
        </PanelIntro>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Target name">
            <TextInput value={importName} placeholder="my-reviewer" onChange={(e) => setImportName(e.target.value)} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Format</span>
            <Segmented
              label="Import format"
              value={importDialect}
              options={[{ value: 'claude', label: 'Claude' }, { value: 'codex', label: 'Codex (pinned)' }]}
              onChange={setImportDialect}
            />
          </div>
          {importDialect === 'codex' ? (
            <Field label="Pinned Codex version" hint="Required. Must match the pinned adapter version." tone={codexNeedsVersion && importContent.trim() !== '' ? 'bad' : 'default'}>
              <TextInput mono value={importVersion} onChange={(e) => setImportVersion(e.target.value)} />
            </Field>
          ) : null}
          <div className="md:col-span-2">
            <Field label="Definition content">
              <CodeArea rows={7} value={importContent} placeholder={IMPORT_PLACEHOLDER} onChange={(e) => setImportContent(e.target.value)} />
            </Field>
          </div>
        </div>
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null || importName.trim() === '' || importContent.trim() === '' || codexNeedsVersion}
            onClick={() => void importDefinition()}
          >
            {busy === 'import' ? 'Importing…' : 'Import definition'}
          </Button>
        </div>
      </Section>
    </PanelBody>
  )
}
