import { useScopedState } from '../../hooks/useScopedState.ts'
import { ErrorNotice } from '../common/ErrorNotice.tsx'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Icon from '../common/Icon.tsx'
import { Badge } from '../ui/Badge.tsx'
import { Button } from '../ui/Button.tsx'
import { Field } from '../ui/Field.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Panel } from '../ui/Panel.tsx'
import { Select } from '../ui/Select.tsx'
import { Switch } from '../ui/Switch.tsx'
import { TextInput } from '../ui/TextInput.tsx'
import {
  cancelChild,
  createMemory,
  deleteMemory,
  deleteSecret,
  deleteSkill,
  getSkill,
  listAgentDefinitions,
  deleteAgentDefinition,
  fetchHooks,
  importAgentDefinition,
  importMcpServers,
  listChildren,
  listMcpServers,
  listSecrets,
  listSkills,
  readMemory,
  saveHooks,
  saveSkill,
  searchMemory,
  setMcpServerAction,
  setSecret,
  spawnChild,
  updateMemory,
  upsertMcpServer,
} from '../../lib/api.ts'
import type { AgentDefinitionRow, ChildRow, HookBindingRow, HooksConfigRow, McpServerRow, MemoryEntryRow, SkillRow } from '../../lib/types.ts'

const HOOK_EVENTS: readonly { readonly key: keyof HooksConfigRow['hooks']; readonly label: string; readonly hint: string }[] = [
  { key: 'PreToolUse', label: 'PreToolUse', hint: 'Runs before a tool executes; exit 2 blocks the call.' },
  { key: 'PostToolUse', label: 'PostToolUse', hint: 'Runs after a tool returns; validates output.' },
  { key: 'UserPromptSubmit', label: 'UserPromptSubmit', hint: 'Runs when a message is accepted; fail-closed.' },
  { key: 'SessionStart', label: 'SessionStart', hint: 'Runs when a session is created.' },
  { key: 'SessionEnd', label: 'SessionEnd', hint: 'Runs when a session is closed.' },
  { key: 'PreCompact', label: 'PreCompact', hint: 'Runs before manual compaction; can block it.' },
]

const HOOK_EVENT_KEYS = new Set<string>(HOOK_EVENTS.map((event) => event.key))
const HOOK_DOCUMENT_KEYS = new Set(['version', 'hooks'])
const HOOK_BINDING_KEYS = new Set(['matcher', 'type', 'command', 'args', 'timeoutMs', 'onFailure'])
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Validate untrusted raw hooks JSON before it can enter typed editor state or be saved. */
export function validateHooksConfig(value: unknown): HooksConfigRow {
  if (!isRecord(value)) throw new Error('Hooks validation error: document must be an object.')
  const unknownDocumentKey = Object.keys(value).find((key) => !HOOK_DOCUMENT_KEYS.has(key))
  if (unknownDocumentKey !== undefined) throw new Error(`Hooks validation error: unknown top-level key "${unknownDocumentKey}".`)
  if (value.version !== 1) throw new Error('Hooks validation error: version must be 1.')
  if (!('hooks' in value) || !isRecord(value.hooks)) throw new Error('Hooks validation error: hooks is required and must be an object.')
  const hooks: Partial<Record<keyof HooksConfigRow['hooks'], readonly HookBindingRow[]>> = {}
  for (const [event, rawBindings] of Object.entries(value.hooks)) {
    if (!HOOK_EVENT_KEYS.has(event)) throw new Error(`Hooks validation error: unknown event "${event}".`)
    if (!Array.isArray(rawBindings)) throw new Error(`Hooks validation error: ${event} must be an array.`)
    hooks[event as keyof HooksConfigRow['hooks']] = rawBindings.map((rawBinding, index): HookBindingRow => {
      const at = `${event}[${index}]`
      if (!isRecord(rawBinding)) throw new Error(`Hooks validation error: ${at} must be an object.`)
      const unknownBindingKey = Object.keys(rawBinding).find((key) => !HOOK_BINDING_KEYS.has(key))
      if (unknownBindingKey !== undefined) throw new Error(`Hooks validation error: ${at} has unknown key "${unknownBindingKey}".`)
      if (typeof rawBinding.matcher !== 'string') throw new Error(`Hooks validation error: ${at}.matcher must be a string.`)
      if (rawBinding.type !== 'command') throw new Error(`Hooks validation error: ${at}.type must be "command".`)
      if (typeof rawBinding.command !== 'string' || rawBinding.command.trim() === '') throw new Error(`Hooks validation error: ${at}.command must be a non-empty string.`)
      if (rawBinding.args !== undefined && (!Array.isArray(rawBinding.args) || !rawBinding.args.every((arg) => typeof arg === 'string'))) throw new Error(`Hooks validation error: ${at}.args must be an array of strings.`)
      if (rawBinding.timeoutMs !== undefined && (typeof rawBinding.timeoutMs !== 'number' || !Number.isFinite(rawBinding.timeoutMs) || rawBinding.timeoutMs <= 0)) throw new Error(`Hooks validation error: ${at}.timeoutMs must be a positive finite number.`)
      if (rawBinding.onFailure !== 'deny' && rawBinding.onFailure !== 'allow') throw new Error(`Hooks validation error: ${at}.onFailure must be "deny" or "allow".`)
      return {
        matcher: rawBinding.matcher,
        type: 'command',
        command: rawBinding.command,
        ...(rawBinding.args !== undefined ? { args: rawBinding.args as string[] } : {}),
        ...(rawBinding.timeoutMs !== undefined ? { timeoutMs: rawBinding.timeoutMs } : {}),
        onFailure: rawBinding.onFailure,
      }
    })
  }
  return { version: 1, hooks }
}

/** Shared inline notice: every panel reports success/failure through this. */
function Notice({ kind, text }: { readonly kind: 'ok' | 'bad' | 'info'; readonly text: string }) {
  if (kind === 'bad') return <ErrorNotice raw={text} />
  return (
    <p className={`manage-notice tone-${kind}`} role="status">
      <Icon name={kind === 'ok' ? 'check' : 'info'} size={13} />
      <span>{text}</span>
    </p>
  )
}

function linesToArray(raw: string): string[] {
  return raw.split('\n').map((line) => line.trim()).filter((line) => line !== '')
}

/** Honest isolation statement shown wherever host-privileged execution exists. */
function IsolationNote() {
  return (
    <p className="manage-warning">
      <Icon name="alertTriangle" size={13} />
      <span>
        MCP servers, subprocesses, and hooks run with host process privileges. Application controls are
        <b> not an OS sandbox</b>. Server writes are outside the application writer lease.
      </span>
    </p>
  )
}

const CHILD_TONE: Readonly<Record<ChildRow['status'], 'green' | 'blue' | 'amber' | 'gray'>> = {
  running: 'blue',
  completed: 'green',
  failed: 'amber',
  cancelled: 'gray',
  interrupted: 'amber',
}

/**
 * Agent roles + bounded one-level delegation. A role restricts the child's
 * tools; it never grants the workspace policy or the mode ceiling anything.
 */
function AgentsPanelContent({ workspaceId, rootSessionId, onOpenChild }: { readonly workspaceId: string | null; readonly rootSessionId: string | null; readonly onOpenChild?: (childSessionId: string) => void }) {
  const [definitions, setDefinitions] = useScopedState<readonly AgentDefinitionRow[]>([])
  const [children, setChildren] = useScopedState<readonly ChildRow[]>([])
  const [selected, setSelected] = useScopedState<string>('explorer')
  const [objective, setObjective] = useScopedState('')
  const [constraints, setConstraints] = useScopedState('')
  const [references, setReferences] = useScopedState('')
  const [requiredResult, setRequiredResult] = useScopedState('bounded summary with file references')
  const [grants, setGrants] = useScopedState('')
  const [notice, setNotice] = useScopedState<{ readonly kind: 'ok' | 'bad' | 'info'; readonly text: string } | null>(null)
  const [busy, setBusy] = useScopedState(false)
  const [importName, setImportName] = useScopedState('')
  const [importContent, setImportContent] = useScopedState('')
  const [importDialect, setImportDialect] = useScopedState<'claude' | 'codex'>('claude')
  const [importVersion, setImportVersion] = useScopedState('')

  const refresh = useCallback(async () => {
    if (workspaceId === null || rootSessionId === null) return
    try {
      setChildren(await listChildren(workspaceId, rootSessionId))
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    }
  }, [workspaceId, rootSessionId])

  const refreshDefinitions = useCallback(async () => {
    if (workspaceId === null) return
    try { setDefinitions(await listAgentDefinitions(workspaceId)) }
    catch (cause) { setNotice({ kind: 'bad', text: String(cause) }) }
  }, [workspaceId])
  useEffect(() => { void refreshDefinitions() }, [refreshDefinitions])
  const [deleteName, setDeleteName] = useScopedState<string | null>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Auto-poll while any child is running (spec: AgentsPanel v2) — the
  // manual "Wait" button is gone; polling stops when none are running.
  useEffect(() => {
    if (workspaceId === null || rootSessionId === null) return
    if (!children.some((child) => child.status === 'running')) return
    const timer = window.setInterval(() => { void refresh() }, 3000)
    return () => { window.clearInterval(timer) }
  }, [children, workspaceId, rootSessionId, refresh])

  const current = useMemo(() => definitions.find((row) => row.definition.name === selected), [definitions, selected])

  if (workspaceId === null) return <Notice kind="info" text="Choose a workspace first." />

  const spawn = async (): Promise<void> => {
    if (rootSessionId === null || objective.trim() === '') return
    setBusy(true)
    try {
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
      await refresh()
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="manage-panel">
      <Notice kind="info" text="One level of delegation: only the root can spawn children. Up to 3 children run concurrently, with 8 per turn." />

      <section className="manage-section">
        <div className="manage-section-head">
          <span className="manage-section-title">ROLES<Badge tone="gray">{definitions.length}</Badge></span>
        </div>
        <div className="manage-card-grid">
          {definitions.map((row) => (
            <button
              key={row.definition.name}
              type="button"
              className={`manage-card ${row.definition.name === selected ? 'is-selected' : ''}`}
              onClick={() => setSelected(row.definition.name)}
            >
              <span className="manage-card-title">
                {row.definition.name}
                <Badge tone="gray">{row.source}</Badge>
              </span>
              <span className="manage-card-sub">{row.definition.description}</span>
              <span className="manage-card-meta">
                tools: {row.definition.tools.length > 0 ? row.definition.tools.join(', ') : '—'}
              </span>
            </button>
          ))}
        </div>
        {current !== undefined && current.definition.disallowedTools.length > 0 ? (
          <p className="manage-hint">Always denied: {current.definition.disallowedTools.join(', ')}</p>
        ) : null}
      </section>

      {current ? <section className="manage-section"><details><summary>Inspect selected definition</summary><pre className="manage-code">{JSON.stringify(current.definition, null, 2)}</pre></details>
        {current.source === 'workspace' ? <div className="manage-actions">{deleteName === current.definition.name ? <><span>Delete this workspace definition? Existing child results remain.</span><Button variant="outline-danger" onClick={() => void deleteAgentDefinition(workspaceId, current.definition.name).then(() => { setDeleteName(null); setSelected('explorer'); void refreshDefinitions() }, cause => setNotice({ kind: 'bad', text: String(cause) }))}>Delete definition</Button><Button onClick={() => setDeleteName(null)}>Cancel deletion</Button></> : <Button onClick={() => setDeleteName(current.definition.name)}>Delete selected agent</Button>}</div> : null}
      </section> : null}

      <section className="manage-section">
        <div className="manage-section-head">
          <span className="manage-section-title">TASK PACKET</span>
          {rootSessionId === null ? <Badge tone="amber">No conversation selected</Badge> : null}
        </div>
        <div className="manage-form-grid">
          <Field label="Objective" hint="The child receives only this task packet, not the root conversation history.">
            <TextInput value={objective} placeholder="Investigate why the build is slow" onChange={(e) => setObjective(e.target.value)} />
          </Field>
          <Field label="Constraints" hint="One constraint per line.">
            <textarea className="manage-code" rows={3} value={constraints} onChange={(e) => setConstraints(e.target.value)} />
          </Field>
          <Field label="References" hint="One reference path or note per line.">
            <textarea className="manage-code" rows={3} value={references} onChange={(e) => setReferences(e.target.value)} />
          </Field>
          <Field label="Required result">
            <TextInput value={requiredResult} onChange={(e) => setRequiredResult(e.target.value)} />
          </Field>
          <Field label="Explicit tool grants" hint="One tool per line. Grants only narrow the definition; MCP tools always require an explicit grant.">
            <textarea className="manage-code" rows={2} value={grants} onChange={(e) => setGrants(e.target.value)} />
          </Field>
        </div>
        <div className="manage-actions">
          <Button
            variant="primary"
            size="sm"
            disabled={busy || rootSessionId === null || objective.trim() === ''}
            onClick={() => void spawn()}
          >
            <Icon name="send" size={12} /> {busy ? 'Spawning…' : `Spawn ${selected}`}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refresh()}>
            <Icon name="refresh" size={12} /> Refresh children
          </Button>
        </div>
        {notice !== null ? <Notice kind={notice.kind} text={notice.text} /> : null}
      </section>

      <section className="manage-section">
        <div className="manage-section-head">
          <span className="manage-section-title">CHILDREN<Badge tone="gray">{children.length}</Badge></span>
        </div>
        {children.length === 0 ? (
          <p className="manage-hint">No child agents for the current conversation.</p>
        ) : (
          <ul className="manage-list">
            {children.map((child) => (
              <li key={child.childSessionId} className="manage-child">
                <div className="manage-child-head">
                  <b>{child.definitionName}</b>
                  <Badge tone={CHILD_TONE[child.status]}>{child.status}</Badge>
                  <code className="manage-mono">{child.childSessionId.slice(0, 14)}…</code>
                  {child.error !== undefined ? <span className="manage-error">{child.error}</span> : null}
                </div>
                {child.result !== undefined ? (
                  <>
                    <p className="manage-child-summary">{child.result.summary}</p>
                    {child.result.fileReferences.length > 0 ? (
                      <p className="manage-hint">Files: {child.result.fileReferences.join(', ')}</p>
                    ) : null}
                  </>
                ) : null}
                <div className="manage-actions">
                  {onOpenChild !== undefined ? (
                    <Button variant="outline" size="sm" onClick={() => onOpenChild(child.childSessionId)}>
                      <Icon name="chevronRight" size={12} /> Open
                    </Button>
                  ) : null}
                  {child.status === 'running' ? (
                    <Button variant="outline-danger" size="sm" onClick={() => void cancelChild(workspaceId, child.childSessionId).then(refresh, () => refresh())}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="manage-section">
        <div className="manage-section-head">
          <span className="manage-section-title">IMPORT (Claude / Codex)</span>
        </div>
        <p className="manage-hint">
          Imports record provenance and never run content automatically. Unsupported security fields (hooks, mcpServers, isolation…)
          block activation and return an error.
        </p>
        <div className="manage-form-grid">
          <Field label="Target name">
            <TextInput value={importName} placeholder="my-reviewer" onChange={(e) => setImportName(e.target.value)} />
          </Field>
          <Field label="Dialect">
            <div className="manage-actions">
              <Switch checked={importDialect === 'claude'} label="Claude" onChange={() => setImportDialect('claude')} />
              <Switch checked={importDialect === 'codex'} label="Codex (pinned)" onChange={() => setImportDialect('codex')} />
            </div>
          </Field>
          {importDialect === 'codex' ? (
            <Field label="Pinned Codex version" hint="Must match the pinned adapter version.">
              <TextInput mono value={importVersion} onChange={(e) => setImportVersion(e.target.value)} />
            </Field>
          ) : null}
          <Field label="Definition content">
            <textarea
              className="manage-code"
              rows={6}
              value={importContent}
              placeholder={'---\\ndescription: "reviews code"\\ntools: ["Read", "Grep"]\\n---\\n\\nReview carefully.'}
              onChange={(e) => setImportContent(e.target.value)}
            />
          </Field>
        </div>
        <div className="manage-actions">
          <Button
            variant="outline"
            size="sm"
            disabled={importName.trim() === '' || importContent.trim() === ''}
            onClick={() =>
              void importAgentDefinition(workspaceId, importName.trim(), {
                content: importContent,
                dialect: importDialect,
                ...(importDialect === 'codex' && importVersion.trim() !== '' ? { sourceVersion: importVersion.trim() } : {}),
              }).then(
                (result) => {
                  void refreshDefinitions()
                  setSelected(importName.trim())
                  setNotice({
                    kind: 'ok',
                    text: `Imported ${result.imported.join(', ')}${result.blocked !== undefined && result.blocked.length > 0 ? ` — blocked: ${result.blocked.join(', ')}` : ''}`,
                  })
                },
                (cause: unknown) => setNotice({ kind: 'bad', text: String(cause) }),
              )
            }
          >
            Import definition
          </Button>
        </div>
      </section>
    </div>
  )
}

/** MCP server management: status, enable/disable/reconnect, creation, import. */
function McpPanelContent({ workspaceId }: { readonly workspaceId: string | null }) {
  const [rows, setRows] = useScopedState<readonly McpServerRow[]>([])
  const [notice, setNotice] = useScopedState<{ readonly kind: 'ok' | 'bad' | 'info'; readonly text: string } | null>(null)
  const [name, setName] = useScopedState('')
  const [transport, setTransport] = useScopedState<'stdio' | 'http'>('stdio')
  const [command, setCommand] = useScopedState('')
  const [argsRaw, setArgsRaw] = useScopedState('')
  const [url, setUrl] = useScopedState('')
  const [tokenRef, setTokenRef] = useScopedState('${MCP_TOKEN}')
  const [allowedTools, setAllowedTools] = useScopedState('')
  const [timeoutMs, setTimeoutMs] = useScopedState('15000')
  const [enabled, setEnabled] = useScopedState(false)
  const [memoryMb, setMemoryMb] = useScopedState('')
  const [cpuPercent, setCpuPercent] = useScopedState('')
  const [importContent, setImportContent] = useScopedState('')

  const refresh = useCallback(async () => {
    if (workspaceId === null) return
    try {
      setRows(await listMcpServers(workspaceId))
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (workspaceId === null) return <Notice kind="info" text="Choose a workspace first." />

  const act = (server: string, action: 'enable' | 'disable' | 'reconnect'): void => {
    void setMcpServerAction(workspaceId, server, action).then(
      (result) => {
        setNotice({ kind: 'ok', text: `${server}: ${result.status}` })
        void refresh()
      },
      (cause: unknown) => setNotice({ kind: 'bad', text: String(cause) }),
    )
  }

  const save = (): void => {
    const trimmed = name.trim()
    if (trimmed === '') {
      setNotice({ kind: 'bad', text: 'Enter a server name using letters, numbers, underscores, or hyphens.' })
      return
    }
    const config: Record<string, unknown> = {
      transport,
      enabled,
      timeoutMs: Number(timeoutMs) > 0 ? Number(timeoutMs) : 15000,
      allowedTools: linesToArray(allowedTools),
      ...(transport === 'stdio'
        ? { command: command.trim(), args: linesToArray(argsRaw) }
        : { url: url.trim(), auth: { type: 'bearer', token: tokenRef.trim() } }),
      ...(memoryMb.trim() !== '' || cpuPercent.trim() !== ''
        ? {
            resourceLimits: {
              ...(memoryMb.trim() !== '' ? { memoryMb: Number(memoryMb) } : {}),
              ...(cpuPercent.trim() !== '' ? { cpuPercent: Number(cpuPercent) } : {}),
            },
          }
        : {}),
    }
    void upsertMcpServer(workspaceId, trimmed, config).then(
      () => {
        setNotice({ kind: 'ok', text: `Saved ${trimmed}; use the controls below to enable or disable it.` })
        void refresh()
      },
      (cause: unknown) => setNotice({ kind: 'bad', text: String(cause) }),
    )
  }

  return (
    <div className="manage-panel">
      <IsolationNote />
      <Notice kind="info" text="MCP tools default to ask. requiresUserInteraction always requires approval and cannot become allow. allowedTools filters exposure; it does not grant permission." />

      <section className="manage-section">
        <div className="manage-section-head">
          <span className="manage-section-title">SERVERS<Badge tone="gray">{rows.length}</Badge></span>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}><Icon name="refresh" size={12} /> Refresh</Button>
        </div>
        {rows.length === 0 ? (
          <p className="manage-hint">No MCP servers configured in this workspace.</p>
        ) : (
          <ul className="manage-list">
            {rows.map((row) => (
              <li key={row.name} className="manage-server">
                <span className="manage-server-name">
                  <b>{row.name}</b>
                  <Badge tone="gray">{row.transport}</Badge>
                  <Badge tone={row.status === 'ready' ? 'green' : row.status === 'failed' ? 'amber' : 'gray'}>{row.status}</Badge>
                  {row.breakerOpenUntil !== null ? <Badge tone="amber">breaker</Badge> : null}
                </span>
                <span className="manage-actions">
                  {row.enabled ? (
                    <Button variant="outline" size="sm" onClick={() => act(row.name, 'disable')}>Disable</Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => act(row.name, 'enable')}>Enable</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => act(row.name, 'reconnect')}>
                    <Icon name="refresh" size={12} /> Reconnect
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="manage-section">
        <div className="manage-section-head"><span className="manage-section-title">ADD / UPDATE</span></div>
        <div className="manage-form-grid">
          <Field label="Server name">
            <TextInput value={name} placeholder="notion" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Transport">
            <div className="manage-actions">
              <Switch checked={transport === 'stdio'} label="stdio" onChange={() => setTransport('stdio')} />
              <Switch checked={transport === 'http'} label="Streamable HTTP" onChange={() => setTransport('http')} />
            </div>
          </Field>
          {transport === 'stdio' ? (
            <>
              <Field label="Command" hint="Runs the executable directly, not through a shell adapter.">
                <TextInput mono value={command} placeholder="npx" onChange={(e) => setCommand(e.target.value)} />
              </Field>
              <Field label="Args" hint="One argument per line.">
                <textarea className="manage-code" rows={2} value={argsRaw} onChange={(e) => setArgsRaw(e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label="URL">
                <TextInput mono value={url} placeholder="https://mcp.example.com/mcp" onChange={(e) => setUrl(e.target.value)} />
              </Field>
              <Field label="Bearer token reference" hint="Accepts only ${VAR}. The actual value is stored in Secrets, encrypted at rest.">
                <TextInput mono value={tokenRef} onChange={(e) => setTokenRef(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Allowed tools" hint="One tool per line. Leave blank to expose all server tools.">
            <textarea className="manage-code" rows={2} value={allowedTools} onChange={(e) => setAllowedTools(e.target.value)} />
          </Field>
          <Field label="Timeout (ms)"><TextInput mono value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} /></Field>
          <Field label="Memory limit (MB)" hint="Blank means unlimited. Exceeding the limit terminates the process tree.">
            <TextInput mono value={memoryMb} onChange={(e) => setMemoryMb(e.target.value)} />
          </Field>
          <Field label="CPU limit (%)" hint="Measured as CPU delta per second divided by core count; not a sandbox.">
            <TextInput mono value={cpuPercent} onChange={(e) => setCpuPercent(e.target.value)} />
          </Field>
          <Switch checked={enabled} label="Enabled" hint="Saving a disabled server does not start a subprocess." onChange={setEnabled} />
        </div>
        <div className="manage-actions">
          <Button variant="primary" size="sm" onClick={save}><Icon name="plus" size={12} /> Save server</Button>
        </div>
        {notice !== null ? <Notice kind={notice.kind} text={notice.text} /> : null}
      </section>

      <section className="manage-section">
        <div className="manage-section-head"><span className="manage-section-title">Import (disabled by default)</span></div>
        <p className="manage-hint">Import Claude .mcp.json or Codex configuration with provenance. Imported servers always remain disabled and do not start.</p>
        <Field label="Content">
          <textarea
            className="manage-code"
            rows={5}
            value={importContent}
            placeholder={'{"mcpServers": {"local-fs": {"command": "npx", "args": ["-y", "@example/fs-mcp"]}}}'}
            onChange={(e) => setImportContent(e.target.value)}
          />
        </Field>
        <div className="manage-actions">
          <Button
            variant="outline"
            size="sm"
            disabled={importContent.trim() === ''}
            onClick={() =>
              void importMcpServers(workspaceId, { content: importContent, dialect: 'claude' }).then(
                (result) => {
                  setNotice({ kind: 'ok', text: `Imported ${result.imported.join(', ')} (disabled)` })
                  void refresh()
                },
                (cause: unknown) => setNotice({ kind: 'bad', text: String(cause) }),
              )
            }
          >
            Import servers
          </Button>
        </div>
      </section>
    </div>
  )
}

/**
 * Hook bindings editor v2 (spec: Settings v2): one section per hook event,
 * bindings as a small form grid; document-level PUT only. The raw JSON
 * disclosure stays as the escape hatch for hand-written configs — saved
 * through the same document PUT, validated on use.
 */
function HooksPanelContent({ workspaceId }: { readonly workspaceId: string | null }) {
  const [config, setConfig] = useScopedState<HooksConfigRow | null>(null)
  const [original, setOriginal] = useScopedState<HooksConfigRow | null>(null)
  const [rawMode, setRawMode] = useScopedState(false)
  const [rawDraft, setRawDraft] = useScopedState('')
  const [notice, setNotice] = useScopedState<{ readonly kind: 'ok' | 'bad' | 'info'; readonly text: string } | null>(null)

  const load = useCallback(async () => {
    if (workspaceId === null) return
    try {
      const loaded = validateHooksConfig(await fetchHooks(workspaceId))
      setConfig(loaded)
      setOriginal(loaded)
      setRawDraft(JSON.stringify(loaded, null, 2))
      setNotice(null)
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    }
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  if (workspaceId === null) return <Notice kind="info" text="Choose a workspace first." />
  if (config === null) return <Notice kind="info" text="Loading hooks…" />

  const sameConfig = JSON.stringify(config) === JSON.stringify(original)
  const commandMissing = Object.values(config.hooks).some((bindings) => bindings?.some((binding) => binding.command.trim() === '')) === true

  const update = (mutate: (current: HooksConfigRow) => HooksConfigRow): void => {
    setConfig((current) => (current === null ? current : mutate(current)))
    setNotice(null)
  }

  const updateBinding = (event: keyof HooksConfigRow['hooks'], index: number, map: (binding: HookBindingRow) => HookBindingRow): void => {
    update((current) => ({
      ...current,
      hooks: {
        ...current.hooks,
        [event]: (current.hooks[event] ?? []).map((binding, i) => (i === index ? map(binding) : binding)),
      },
    }))
  }

  const removeBinding = (event: keyof HooksConfigRow['hooks'], index: number): void => {
    update((current) => ({
      ...current,
      hooks: { ...current.hooks, [event]: (current.hooks[event] ?? []).filter((_, i) => i !== index) },
    }))
  }

  const addBinding = (event: keyof HooksConfigRow['hooks']): void => {
    update((current) => ({
      ...current,
      hooks: {
        ...current.hooks,
        [event]: [...(current.hooks[event] ?? []), { matcher: '*', type: 'command' as const, command: '', onFailure: 'deny' as const }],
      },
    }))
  }

  const save = (): void => {
    if (commandMissing) return
    let validated: HooksConfigRow
    try { validated = validateHooksConfig(config) }
    catch (cause) { setNotice({ kind: 'bad', text: cause instanceof Error ? cause.message : String(cause) }); return }
    void saveHooks(workspaceId, validated).then(
      () => {
        setOriginal(config)
        setNotice({ kind: 'ok', text: 'Saved hooks.json — validated on use.' })
      },
      (cause: unknown) => setNotice({ kind: 'bad', text: String(cause) }),
    )
  }

  const applyRaw = (): void => {
    try {
      const parsed: unknown = JSON.parse(rawDraft)
      setConfig(validateHooksConfig(parsed))
      setRawMode(false)
      setNotice(null)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      setNotice({ kind: 'bad', text: detail.startsWith('Hooks validation error:') ? detail : `Invalid JSON: ${detail}` })
    }
  }

  return (
    <div className="manage-panel">
      <IsolationNote />
      <Notice kind="info" text="PreToolUse can block or rewrite arguments; rewrites are logged and pass every gate again. PostToolUse validates output. UserPromptSubmit injects context. Every execution is audited with argument and result hashes." />
      {HOOK_EVENTS.map((entry) => {
        const bindings = config.hooks[entry.key] ?? []
        return (
          <section className="manage-section" key={entry.key}>
            <div className="manage-section-head">
              <span className="manage-section-title">{entry.label}<Badge tone="gray">{bindings.length}</Badge></span>
              <Button variant="ghost" size="sm" onClick={() => addBinding(entry.key)}><Icon name="plus" size={12} /> Add binding</Button>
            </div>
            <p className="manage-hint">{entry.hint}</p>
            {bindings.length === 0 ? (
              <p className="manage-hint">No bindings for this event.</p>
            ) : (
              bindings.map((binding, index) => (
                <div className="hooks-binding" key={index}>
                  <Field label="Matcher" hint="Tool-name glob, e.g. Bash or mcp__*__*">
                    <TextInput value={binding.matcher} onChange={(e) => updateBinding(entry.key, index, (row) => ({ ...row, matcher: e.target.value }))} />
                  </Field>
                  <Field label="Command">
                    <TextInput mono value={binding.command} placeholder="node scripts/guard.mjs" onChange={(e) => updateBinding(entry.key, index, (row) => ({ ...row, command: e.target.value }))} />
                  </Field>
                  <Field label="Args" hint="One argument per line.">
                    <textarea
                      className="manage-code"
                      rows={2}
                      value={(binding.args ?? []).join('\n')}
                      onChange={(e) => updateBinding(entry.key, index, (row) => ({ ...row, args: linesToArray(e.target.value) }))}
                    />
                  </Field>
                  <Field label="Timeout (ms)">
                    <TextInput
                      mono
                      value={binding.timeoutMs !== undefined ? String(binding.timeoutMs) : ''}
                      onChange={(e) => updateBinding(entry.key, index, (row) => {
                        const ms = Number(e.target.value)
                        if (!(ms > 0)) {
                          const { timeoutMs: _dropped, ...rest } = row
                          return rest
                        }
                        return { ...row, timeoutMs: ms }
                      })}
                    />
                  </Field>
                  <Field label="On failure">
                    <Select
                      value={binding.onFailure}
                      label={`On failure for ${entry.label} binding ${index + 1}`}
                      triggerClassName="hooks-failure-select"
                      options={[{ value: 'deny', label: 'deny' }, { value: 'allow', label: 'allow' }]}
                      onChange={(value) => updateBinding(entry.key, index, (row) => ({ ...row, onFailure: value as 'deny' | 'allow' }))}
                    />
                  </Field>
                  <IconButton label={`Remove ${entry.label} binding ${index + 1}`} onClick={() => removeBinding(entry.key, index)}>
                    <Icon name="trash" size={13} />
                  </IconButton>
                </div>
              ))
            )}
          </section>
        )
      })}
      {rawMode ? (
        <section className="manage-section">
          <div className="manage-section-head"><span className="manage-section-title">RAW hooks.json</span></div>
          <Field label="hooks.json" hint="Applied back into the form with “Apply raw”; the server validates on use.">
            <textarea className="manage-code manage-code-tall" rows={14} value={rawDraft} onChange={(e) => setRawDraft(e.target.value)} />
          </Field>
          <div className="manage-actions">
            <Button variant="outline" size="sm" onClick={applyRaw}>Apply raw</Button>
            <Button variant="ghost" size="sm" onClick={() => { setRawMode(false); setRawDraft(JSON.stringify(config, null, 2)) }}>Cancel raw</Button>
          </div>
        </section>
      ) : null}
      {notice !== null ? <Notice kind={notice.kind} text={notice.text} /> : null}
      <div className="manage-actions">
        {!rawMode ? <Button variant="ghost" size="sm" onClick={() => { setRawDraft(JSON.stringify(config, null, 2)); setRawMode(true) }}>Advanced · edit raw JSON</Button> : null}
        <Button variant="ghost" size="sm" disabled={original === null || sameConfig} onClick={() => { if (original !== null) { setConfig(original); setRawDraft(JSON.stringify(original, null, 2)); setNotice(null) } }}>Revert</Button>
        <Button variant="primary" size="sm" disabled={sameConfig || commandMissing} title={commandMissing ? 'Every binding needs a command.' : undefined} onClick={save}>
          Save hooks
        </Button>
      </div>
    </div>
  )
}

/** Secrets: masked names only; rotate reconnects affected servers server-side. */
function SecretsPanelContent({ workspaceId }: { readonly workspaceId: string | null }) {
  const [rows, setRows] = useScopedState<readonly { readonly name: string }[]>([])
  const [name, setName] = useScopedState('')
  const [value, setValue] = useScopedState('')
  const [confirming, setConfirming] = useScopedState<string | null>(null)
  const [notice, setNotice] = useScopedState<{ readonly kind: 'ok' | 'bad' | 'info'; readonly text: string } | null>(null)

  const refresh = useCallback(async () => {
    if (workspaceId === null) return
    try {
      setRows(await listSecrets(workspaceId))
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (workspaceId === null) return <Notice kind="info" text="Choose a workspace first." />

  return (
    <div className="manage-panel">
      <Notice kind="info" text="Secrets are encrypted at rest with AES-256-GCM. The master key requires user-scoped ACL/chmod permissions and fails closed if they cannot be set. Only key names are displayed." />
      <section className="manage-section">
        <div className="manage-section-head">
          <span className="manage-section-title">KEYS<Badge tone="gray">{rows.length}</Badge></span>
        </div>
        {rows.length === 0 ? (
          <p className="manage-hint">No secrets stored.</p>
        ) : (
          <ul className="manage-list">
            {rows.map((row) => (
              <li key={row.name} className="manage-server">
                <span className="manage-server-name">
                  <Icon name="key" size={13} />
                  <b>{row.name}</b>
                  <Badge tone="gray">••••••</Badge>
                </span>
                <span className="manage-actions">
                  {confirming === row.name ? (
                    <>
                      <span className="manage-hint">Delete “{row.name}”?</span>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() =>
                          void deleteSecret(workspaceId, row.name).then(
                            () => {
                              setConfirming(null)
                              setNotice({ kind: 'ok', text: `Deleted ${row.name}` })
                              void refresh()
                            },
                            (cause: unknown) => setNotice({ kind: 'bad', text: String(cause) }),
                          )
                        }
                      >
                        Delete permanently
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Cancel</Button>
                    </>
                  ) : (
                    <IconButton label={`Delete ${row.name}`} onClick={() => setConfirming(row.name)}>
                      <Icon name="trash" size={13} />
                    </IconButton>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="manage-section">
        <div className="manage-section-head"><span className="manage-section-title">ROTATE / ADD</span></div>
        <div className="manage-form-grid">
          <Field label="Key name" hint="MCP references this key using ${KEY} in env, headers, or auth.">
            <TextInput mono value={name} placeholder="MCP_TOKEN" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Value" hint="The value is never displayed again after saving.">
            <TextInput mono type="password" value={value} autoComplete="off" onChange={(e) => setValue(e.target.value)} />
          </Field>
        </div>
        <div className="manage-actions">
          <Button
            variant="primary"
            size="sm"
            disabled={name.trim() === '' || value === ''}
            onClick={() =>
              void setSecret(workspaceId, name.trim(), value).then(
                (result) => {
                  setNotice({
                    kind: 'ok',
                    text: `Rotated ${result.rotated}${result.reconnected !== undefined && result.reconnected.length > 0 ? ` — reconnect: ${result.reconnected.join(', ')}` : ''}`,
                  })
                  setName('')
                  setValue('')
                  void refresh()
                },
                (cause: unknown) => setNotice({ kind: 'bad', text: String(cause) }),
              )
            }
          >
            Save / rotate key
          </Button>
        </div>
        {notice !== null ? <Notice kind={notice.kind} text={notice.text} /> : null}
      </section>
    </div>
  )
}

/** kebab-case id from a title (memory create uses it as the entry id). */
function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}

const isConflict = (cause: unknown): boolean => /409/.test(String(cause))

/**
 * Skills (spec: Settings v2): workspace SKILL.md files with bundled rows
 * read-only. The editor loads the real content (GET single) so saves are
 * never blind; expectedHash conflicts offer Reload / Overwrite — overwrite
 * re-reads the fresh hash first, never clobbering silently.
 */
function SkillsPanelContent({ workspaceId }: { readonly workspaceId: string | null }) {
  const [rows, setRows] = useScopedState<readonly SkillRow[]>([])
  const [notice, setNotice] = useScopedState<{ readonly kind: 'ok' | 'bad' | 'info'; readonly text: string } | null>(null)
  const [editing, setEditing] = useScopedState<{ readonly name: string; readonly isNew: boolean; readonly hash: string | null } | null>(null)
  const [newName, setNewName] = useScopedState('')
  const [content, setContent] = useScopedState('')
  const [busy, setBusy] = useScopedState(false)
  const [conflict, setConflict] = useScopedState(false)
  const [deleteName, setDeleteName] = useScopedState<string | null>(null)

  const refresh = useCallback(async () => {
    if (workspaceId === null) return
    try { setRows(await listSkills(workspaceId)) }
    catch (cause) { setNotice({ kind: 'bad', text: String(cause) }) }
  }, [workspaceId])

  useEffect(() => { void refresh() }, [refresh])

  if (workspaceId === null) return <Notice kind="info" text="Choose a workspace first." />

  const openEditor = async (row: SkillRow): Promise<void> => {
    setBusy(true)
    setNotice(null)
    setConflict(false)
    try {
      const loaded = await getSkill(workspaceId, row.name)
      setEditing({ name: row.name, isNew: false, hash: loaded.hash })
      setContent(loaded.instructions)
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    } finally { setBusy(false) }
  }

  const beginNew = (): void => {
    setEditing({ name: '', isNew: true, hash: null })
    setNewName('')
    setContent('')
    setConflict(false)
    setNotice(null)
  }

  const save = async (hashOverride?: string): Promise<void> => {
    if (editing === null || busy) return
    const name = editing.isNew ? newName.trim() : editing.name
    if (name === '' || content.trim() === '') {
      setNotice({ kind: 'bad', text: 'A skill needs a name and non-empty SKILL.md content.' })
      return
    }
    const expectedHash = hashOverride ?? editing.hash ?? undefined
    setBusy(true)
    try {
      const saved = await saveSkill(workspaceId, name, content, expectedHash)
      setNotice({ kind: 'ok', text: `Saved ${saved.name} (${saved.hash.slice(0, 8)}).` })
      setEditing(null)
      setConflict(false)
      await refresh()
    } catch (cause) {
      if (isConflict(cause)) {
        setConflict(true)
        setNotice({ kind: 'bad', text: 'Changed on disk since you opened it.' })
      } else {
        setNotice({ kind: 'bad', text: String(cause) })
      }
    } finally { setBusy(false) }
  }

  const overwrite = async (): Promise<void> => {
    if (editing === null) return
    setBusy(true)
    try {
      const fresh = await getSkill(workspaceId, editing.name)
      setBusy(false)
      await save(fresh.hash)
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
      setBusy(false)
    }
  }

  const reloadServer = async (): Promise<void> => {
    if (editing === null) return
    setBusy(true)
    try {
      const fresh = await getSkill(workspaceId, editing.name)
      setContent(fresh.instructions)
      setEditing({ ...editing, hash: fresh.hash })
      setConflict(false)
      setNotice({ kind: 'info', text: 'Loaded the server version.' })
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    } finally { setBusy(false) }
  }

  const remove = (row: SkillRow): void => {
    void deleteSkill(workspaceId, row.name).then(
      () => { setDeleteName(null); setNotice({ kind: 'ok', text: `Deleted ${row.name}.` }); void refresh() },
      (cause: unknown) => setNotice({ kind: 'bad', text: String(cause) }),
    )
  }

  return (
    <div className="manage-panel">
      <Notice kind="info" text="Skills are SKILL.md instruction packages the model can load by name. Bundled rows are read-only; workspace rows are yours." />
      {editing === null ? (
        <section className="manage-section">
          <div className="manage-section-head">
            <span className="manage-section-title">SKILLS<Badge tone="gray">{rows.length}</Badge></span>
            <Button variant="ghost" size="sm" onClick={beginNew}><Icon name="plus" size={12} /> New skill</Button>
          </div>
          {rows.length === 0 ? (
            <p className="manage-hint">No skills in this workspace.</p>
          ) : (
            <ul className="manage-list">
              {rows.map((row) => (
                <li key={row.name} className="manage-server">
                  <span className="manage-server-name">
                    <b>{row.name}</b>
                    <Badge tone={row.source === 'bundled' ? 'gray' : 'blue'}>{row.source}</Badge>
                    {row.title !== '' && row.title !== row.name ? <span className="manage-hint">{row.title}</span> : null}
                    <code className="manage-mono">{row.hash.slice(0, 8)}</code>
                  </span>
                  <span className="manage-actions">
                    {row.source === 'workspace' ? (
                      <>
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => void openEditor(row)}>Edit</Button>
                        {deleteName === row.name ? (
                          <>
                            <span className="manage-hint">Delete “{row.name}”?</span>
                            <Button variant="outline-danger" size="sm" onClick={() => remove(row)}>Delete permanently</Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteName(null)}>Cancel</Button>
                          </>
                        ) : (
                          <IconButton label={`Delete ${row.name}`} onClick={() => setDeleteName(row.name)}>
                            <Icon name="trash" size={13} />
                          </IconButton>
                        )}
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="manage-section">
          <div className="manage-section-head">
            <span className="manage-section-title">{editing.isNew ? 'NEW SKILL' : `EDIT · ${editing.name}`}</span>
          </div>
          {editing.isNew ? (
            <Field label="Name" hint="Kebab-case directory name, e.g. deploy-notes.">
              <TextInput value={newName} placeholder="deploy-notes" onChange={(e) => setNewName(e.target.value)} />
            </Field>
          ) : null}
          <Field
            label="SKILL.md content"
            hint="Raw Markdown with frontmatter (name/description). The frontmatter name should match the skill name."
          >
            <textarea className="manage-code manage-code-tall" rows={14} value={content} onChange={(e) => setContent(e.target.value)} placeholder={'---\nname: deploy-notes\ndescription: how deploys work\n---\n\nDeploy runs via pm2…'} />
          </Field>
          {conflict ? (
            <div className="manage-actions">
              <span className="manage-hint">The file changed on disk since you opened it.</span>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void reloadServer()}>Reload server version</Button>
              <Button variant="outline-danger" size="sm" disabled={busy} onClick={() => void overwrite()}>Overwrite anyway</Button>
            </div>
          ) : null}
          {notice !== null ? <Notice kind={notice.kind} text={notice.text} /> : null}
          <div className="manage-actions">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save skill'}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setEditing(null); setConflict(false) }}>Cancel</Button>
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * Memory (spec: Settings v2): scoped entries with debounced search,
 * pinning, and expectedHash-guarded edits — conflicts offer Reload
 * (server wins) or Overwrite (re-read fresh hash, then resubmit).
 */
function MemoryPanelContent({ workspaceId }: { readonly workspaceId: string | null }) {
  const [query, setQuery] = useScopedState('')
  const [rows, setRows] = useScopedState<readonly MemoryEntryRow[]>([])
  const [notice, setNotice] = useScopedState<{ readonly kind: 'ok' | 'bad' | 'info'; readonly text: string } | null>(null)
  const [selectedId, setSelectedId] = useScopedState<string | null>(null)
  const [draft, setDraft] = useScopedState<{ readonly title: string; readonly body: string; readonly pinned: boolean; readonly hash: string | null } | null>(null)
  const [creating, setCreating] = useScopedState(false)
  const [newTitle, setNewTitle] = useScopedState('')
  const [newBody, setNewBody] = useScopedState('')
  const [newPinned, setNewPinned] = useScopedState(false)
  const [busy, setBusy] = useScopedState(false)
  const [conflict, setConflict] = useScopedState(false)

  const refresh = useCallback(async (q: string) => {
    if (workspaceId === null) return
    try { setRows(await searchMemory(workspaceId, q)) }
    catch (cause) { setNotice({ kind: 'bad', text: String(cause) }) }
  }, [workspaceId])

  useEffect(() => {
    if (workspaceId === null) return
    const timer = window.setTimeout(() => { void refresh(query) }, 300)
    return () => { window.clearTimeout(timer) }
  }, [query, workspaceId, refresh])

  if (workspaceId === null) return <Notice kind="info" text="Choose a workspace first." />

  const openEntry = async (row: MemoryEntryRow): Promise<void> => {
    setBusy(true)
    setNotice(null)
    setConflict(false)
    setCreating(false)
    try {
      const entry = await readMemory(workspaceId, row.id)
      setSelectedId(entry.id)
      setDraft({ title: entry.title, body: entry.body, pinned: entry.pinned, hash: entry.hash })
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    } finally { setBusy(false) }
  }

  const beginCreate = (): void => {
    setCreating(true)
    setSelectedId(null)
    setDraft(null)
    setNewTitle('')
    setNewBody('')
    setNewPinned(false)
    setConflict(false)
    setNotice(null)
  }

  const create = async (): Promise<void> => {
    if (busy || newTitle.trim() === '' || newBody.trim() === '') return
    setBusy(true)
    try {
      const created = await createMemory(workspaceId, { id: slugify(newTitle), title: newTitle.trim(), body: newBody, ...(newPinned ? { pinned: true } : {}) })
      setNotice({ kind: 'ok', text: `Created ${created.id}.` })
      setCreating(false)
      await refresh(query)
      await openEntry(created)
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    } finally { setBusy(false) }
  }

  const save = async (hashOverride?: string): Promise<void> => {
    if (selectedId === null || draft === null || busy) return
    if (draft.title.trim() === '' || draft.body.trim() === '') {
      setNotice({ kind: 'bad', text: 'Memory entries need a non-empty title and body.' })
      return
    }
    setBusy(true)
    try {
      const updated = await updateMemory(workspaceId, selectedId, {
        expectedHash: hashOverride ?? draft.hash ?? '',
        title: draft.title,
        body: draft.body,
        pinned: draft.pinned,
      })
      setDraft({ title: updated.title, body: updated.body, pinned: updated.pinned, hash: updated.hash })
      setConflict(false)
      setNotice({ kind: 'ok', text: `Saved ${updated.id}.` })
      await refresh(query)
    } catch (cause) {
      if (isConflict(cause)) {
        setConflict(true)
        setNotice({ kind: 'bad', text: 'Changed on disk since you opened it.' })
      } else {
        setNotice({ kind: 'bad', text: String(cause) })
      }
    } finally { setBusy(false) }
  }

  const overwrite = async (): Promise<void> => {
    if (selectedId === null || draft === null) return
    setBusy(true)
    try {
      const fresh = await readMemory(workspaceId, selectedId)
      setDraft({ ...draft, hash: fresh.hash })
      setBusy(false)
      await save(fresh.hash)
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
      setBusy(false)
    }
  }

  const reloadServer = async (): Promise<void> => {
    if (selectedId === null) return
    setBusy(true)
    try {
      const fresh = await readMemory(workspaceId, selectedId)
      setDraft({ title: fresh.title, body: fresh.body, pinned: fresh.pinned, hash: fresh.hash })
      setConflict(false)
      setNotice({ kind: 'info', text: 'Loaded the server version.' })
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    } finally { setBusy(false) }
  }

  const remove = async (): Promise<void> => {
    if (selectedId === null || busy) return
    setBusy(true)
    try {
      await deleteMemory(workspaceId, selectedId)
      setSelectedId(null)
      setDraft(null)
      setNotice({ kind: 'ok', text: 'Entry deleted.' })
      await refresh(query)
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    } finally { setBusy(false) }
  }

  return (
    <div className="manage-panel">
      <Notice kind="info" text="Memory entries are scoped to this workspace and surfaced to the model by relevance. Pinned entries always load." />
      {creating ? (
        <section className="manage-section">
          <div className="manage-section-head"><span className="manage-section-title">NEW MEMORY ENTRY</span></div>
          <Field label="Title" hint="The entry id is derived from the title (kebab-case).">
            <TextInput value={newTitle} placeholder="deploy-notes" onChange={(e) => setNewTitle(e.target.value)} />
          </Field>
          <Field label="Body">
            <textarea className="manage-code manage-code-tall" rows={8} value={newBody} onChange={(e) => setNewBody(e.target.value)} />
          </Field>
          <Switch checked={newPinned} label="Pinned — always loaded into context" onChange={setNewPinned} />
          {notice !== null ? <Notice kind={notice.kind} text={notice.text} /> : null}
          <div className="manage-actions">
            <Button variant="primary" size="sm" disabled={busy || newTitle.trim() === '' || newBody.trim() === ''} onClick={() => void create()}>Create entry</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </section>
      ) : (
        <>
          <section className="manage-section">
            <div className="manage-section-head">
              <span className="manage-section-title">ENTRIES<Badge tone="gray">{rows.length}</Badge></span>
              <Button variant="ghost" size="sm" onClick={beginCreate}><Icon name="plus" size={12} /> New entry</Button>
            </div>
            <div className="session-filter memory-search">
              <Icon name="search" size={13} />
              <input
                className="filter-input"
                value={query}
                aria-label="Search memory"
                placeholder="Search memory…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {rows.length === 0 ? (
              <p className="manage-hint">{query.trim() === '' ? 'No memory entries yet.' : 'No matching entries.'}</p>
            ) : (
              <ul className="manage-list">
                {rows.map((row) => (
                  <li key={row.id} className="manage-server">
                    <button type="button" className={`memory-row ${row.id === selectedId ? 'is-selected' : ''}`} onClick={() => void openEntry(row)}>
                      <span className="manage-server-name">
                        {row.pinned ? <Icon name="pin" size={12} /> : null}
                        <b>{row.title}</b>
                        <code className="manage-mono">{row.hash.slice(0, 8)}</code>
                      </span>
                      <span className="memory-snippet">{row.body.split('\n')[0] ?? ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {selectedId !== null && draft !== null ? (
            <section className="manage-section">
              <div className="manage-section-head"><span className="manage-section-title">EDIT · {selectedId}</span></div>
              <Field label="Title">
                <TextInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </Field>
              <Switch checked={draft.pinned} label="Pinned — always loaded into context" onChange={(pinned) => setDraft({ ...draft, pinned })} />
              <Field label="Body">
                <textarea className="manage-code manage-code-tall" rows={8} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              </Field>
              {conflict ? (
                <div className="manage-actions">
                  <span className="manage-hint">The entry changed on disk since you opened it.</span>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void reloadServer()}>Reload server version</Button>
                  <Button variant="outline-danger" size="sm" disabled={busy} onClick={() => void overwrite()}>Overwrite anyway</Button>
                </div>
              ) : null}
              {notice !== null ? <Notice kind={notice.kind} text={notice.text} /> : null}
              <div className="manage-actions">
                <Button variant="outline-danger" size="sm" disabled={busy} onClick={() => void remove()}>Delete</Button>
                <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Button>
              </div>
            </section>
          ) : (
            notice !== null ? <Notice kind={notice.kind} text={notice.text} /> : null
          )}
        </>
      )}
    </div>
  )
}

export type ManagementPanel = typeof AgentsPanel | typeof McpPanel | typeof HooksPanel | typeof SecretsPanel
export type PanelProps = { readonly workspaceId: string | null; readonly rootSessionId?: string | null }
export type PanelRenderer = (props: PanelProps) => ReactNode

// Scope changes remount before paint: no A data or drafts can be acted on in B.
export function AgentsPanel(props: { readonly workspaceId: string | null; readonly rootSessionId: string | null; readonly onOpenChild?: (childSessionId: string) => void }) { return <AgentsPanelContent key={JSON.stringify([props.workspaceId, props.rootSessionId])} {...props} /> }
export function McpPanel(props: { readonly workspaceId: string | null }) { return <McpPanelContent key={props.workspaceId} {...props} /> }
export function HooksPanel(props: { readonly workspaceId: string | null }) { return <HooksPanelContent key={props.workspaceId} {...props} /> }
export function SecretsPanel(props: { readonly workspaceId: string | null }) { return <SecretsPanelContent key={props.workspaceId} {...props} /> }
export function SkillsPanel(props: { readonly workspaceId: string | null }) { return <SkillsPanelContent key={props.workspaceId} {...props} /> }
export function MemoryPanel(props: { readonly workspaceId: string | null }) { return <MemoryPanelContent key={props.workspaceId} {...props} /> }
