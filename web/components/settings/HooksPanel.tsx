import { useCallback, useEffect } from 'react'
import { useScopedState } from '../../hooks/useScopedState.ts'
import Icon from '../common/Icon.tsx'
import { Badge } from '../ui/Badge.tsx'
import { Button } from '../ui/Button.tsx'
import { Field } from '../ui/Field.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Segmented } from '../ui/Segmented.tsx'
import { TextInput } from '../ui/TextInput.tsx'
import { fetchHooks, saveHooks } from '../../lib/api.ts'
import type { HookBindingRow, HooksConfigRow } from '../../lib/types.ts'
import { CodeArea, IsolationNote, Notice, PanelBody, PanelIntro, Section, WorkspaceRequired, useActionRunner, type NoticeState } from './settings-kit.tsx'

type HookEventKey = keyof HooksConfigRow['hooks']

const HOOK_EVENTS: readonly { readonly key: HookEventKey; readonly hint: string }[] = [
  { key: 'PreToolUse', hint: 'Before a tool runs. Exit 2 blocks the call; rewrites are logged and pass every gate again.' },
  { key: 'PostToolUse', hint: 'After a tool returns; validates its output.' },
  { key: 'UserPromptSubmit', hint: 'When a message is accepted; can inject context. Fail-closed.' },
  { key: 'SessionStart', hint: 'When a session is created.' },
  { key: 'SessionEnd', hint: 'When a session is closed.' },
  { key: 'PreCompact', hint: 'Before manual compaction; can block it.' },
]

const HOOK_EVENT_KEYS = new Set<string>(HOOK_EVENTS.map((event) => event.key))
const HOOK_DOCUMENT_KEYS = new Set(['version', 'hooks'])
const HOOK_BINDING_KEYS = new Set(['matcher', 'type', 'command', 'args', 'timeoutMs', 'onFailure'])
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const linesToArray = (raw: string): string[] => raw.split('\n').map((line) => line.trim()).filter((line) => line !== '')

/** Validate untrusted raw hooks JSON before it can enter typed editor state or be saved. */
export function validateHooksConfig(value: unknown): HooksConfigRow {
  if (!isRecord(value)) throw new Error('Hooks validation error: document must be an object.')
  const unknownDocumentKey = Object.keys(value).find((key) => !HOOK_DOCUMENT_KEYS.has(key))
  if (unknownDocumentKey !== undefined) throw new Error(`Hooks validation error: unknown top-level key "${unknownDocumentKey}".`)
  if (value.version !== 1) throw new Error('Hooks validation error: version must be 1.')
  if (!('hooks' in value) || !isRecord(value.hooks)) throw new Error('Hooks validation error: hooks is required and must be an object.')
  const hooks: Partial<Record<HookEventKey, readonly HookBindingRow[]>> = {}
  for (const [event, rawBindings] of Object.entries(value.hooks)) {
    if (!HOOK_EVENT_KEYS.has(event)) throw new Error(`Hooks validation error: unknown event "${event}".`)
    if (!Array.isArray(rawBindings)) throw new Error(`Hooks validation error: ${event} must be an array.`)
    hooks[event as HookEventKey] = rawBindings.map((rawBinding, index): HookBindingRow => {
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

/**
 * Hook bindings editor: one section per event, document-level save. The raw
 * JSON editor replaces the form while open, so there is one editing surface
 * at a time; applying it validates before it re-enters the form.
 */
export function HooksPanel(props: { readonly workspaceId: string | null }) {
  return <HooksPanelContent key={props.workspaceId} {...props} />
}

function HooksPanelContent({ workspaceId }: { readonly workspaceId: string | null }) {
  const [config, setConfig] = useScopedState<HooksConfigRow | null>(null)
  const [original, setOriginal] = useScopedState<HooksConfigRow | null>(null)
  const [rawMode, setRawMode] = useScopedState(false)
  const [rawDraft, setRawDraft] = useScopedState('')
  const [notice, setNotice] = useScopedState<NoticeState>(null)
  const { busy, run } = useActionRunner((text) => setNotice({ kind: 'bad', text }))

  const load = useCallback(async () => {
    if (workspaceId === null) return
    try {
      const loaded = validateHooksConfig(await fetchHooks(workspaceId))
      setConfig(loaded)
      setOriginal(loaded)
      setNotice(null)
    } catch (cause) {
      setNotice({ kind: 'bad', text: String(cause) })
    }
  }, [workspaceId])

  useEffect(() => { void load() }, [load])

  if (workspaceId === null) return <WorkspaceRequired />
  if (config === null) return notice !== null ? <Notice kind={notice.kind} text={notice.text} /> : <Notice kind="info" text="Loading hooks…" />

  const dirty = JSON.stringify(config) !== JSON.stringify(original)
  const commandMissing = Object.values(config.hooks).some((bindings) => bindings?.some((binding) => binding.command.trim() === '')) === true

  const update = (mutate: (current: HooksConfigRow) => HooksConfigRow): void => {
    setConfig((current) => (current === null ? current : mutate(current)))
    setNotice(null)
  }
  const setBindings = (event: HookEventKey, map: (bindings: readonly HookBindingRow[]) => readonly HookBindingRow[]): void => {
    update((current) => ({ ...current, hooks: { ...current.hooks, [event]: map(current.hooks[event] ?? []) } }))
  }
  const updateBinding = (event: HookEventKey, index: number, map: (binding: HookBindingRow) => HookBindingRow): void => {
    setBindings(event, (bindings) => bindings.map((binding, i) => (i === index ? map(binding) : binding)))
  }

  const save = (): Promise<void> => run('save', async () => {
    if (commandMissing) return
    let validated: HooksConfigRow
    try { validated = validateHooksConfig(config) }
    catch (cause) { setNotice({ kind: 'bad', text: cause instanceof Error ? cause.message : String(cause) }); return }
    await saveHooks(workspaceId, validated)
    setOriginal(validated)
    setNotice({ kind: 'ok', text: 'Saved hooks.json — validated on use.' })
  })

  const openRaw = (): void => { setRawDraft(JSON.stringify(config, null, 2)); setRawMode(true); setNotice(null) }
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
    <PanelBody>
      <div className="flex flex-col gap-2">
        <IsolationNote />
        <PanelIntro>Every hook execution is audited with argument and result hashes. Changes apply after you save.</PanelIntro>
      </div>

      {/* Actions stay in view while scrolling through six event sections. */}
      <div className="sticky -top-5 z-10 -mx-5 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-5 py-2.5">
        {dirty ? <Badge tone="amber">Unsaved changes</Badge> : <span className="text-xs text-fg-faint">All changes saved</span>}
        <span className="flex-1" />
        {!rawMode ? <Button variant="ghost" size="sm" disabled={busy !== null} onClick={openRaw}>Advanced · edit raw JSON</Button> : null}
        <Button variant="ghost" size="sm" disabled={busy !== null || !dirty || rawMode} onClick={() => { if (original !== null) { setConfig(original); setNotice(null) } }}>Revert</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={busy !== null || !dirty || commandMissing || rawMode}
          title={commandMissing ? 'Every binding needs a command.' : rawMode ? 'Apply or cancel the raw JSON first.' : undefined}
          onClick={() => void save()}
        >
          {busy === 'save' ? 'Saving…' : 'Save hooks'}
        </Button>
      </div>
      {commandMissing && !rawMode ? <Notice kind="info" text="Every binding needs a command before the hooks can be saved." /> : null}
      {notice !== null ? <Notice kind={notice.kind} text={notice.text} /> : null}

      {rawMode ? (
        <Section title="Raw hooks.json">
          <Field label="hooks.json" hint="Apply raw validates the document and loads it back into the form; nothing is saved until Save hooks.">
            <CodeArea tall value={rawDraft} onChange={(e) => setRawDraft(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={applyRaw}>Apply raw</Button>
            <Button variant="ghost" size="sm" onClick={() => { setRawMode(false); setNotice(null) }}>Cancel raw</Button>
          </div>
        </Section>
      ) : HOOK_EVENTS.map((entry) => {
        const bindings = config.hooks[entry.key] ?? []
        return (
          <Section
            key={entry.key}
            title={<code className="font-mono text-[13px]">{entry.key}</code>}
            count={bindings.length}
            actions={<Button variant="ghost" size="sm" onClick={() => setBindings(entry.key, (list) => [...list, { matcher: '*', type: 'command', command: '', onFailure: 'deny' }])}><Icon name="plus" size={13} />Add binding</Button>}
          >
            <p className="m-0 -mt-2 text-xs text-fg-faint">{entry.hint}</p>
            {bindings.map((binding, index) => (
              <div key={index} className="hooks-binding grid gap-3 rounded-xl border border-line p-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                <Field label="Matcher" hint="Tool-name glob, e.g. Bash or mcp__*__*">
                  <TextInput mono value={binding.matcher} onChange={(e) => updateBinding(entry.key, index, (row) => ({ ...row, matcher: e.target.value }))} />
                </Field>
                <Field label="Command" tone={binding.command.trim() === '' ? 'bad' : 'default'} hint={binding.command.trim() === '' ? 'Required.' : undefined}>
                  <TextInput mono invalid={binding.command.trim() === ''} value={binding.command} placeholder="node scripts/guard.mjs" onChange={(e) => updateBinding(entry.key, index, (row) => ({ ...row, command: e.target.value }))} />
                </Field>
                <div className="flex items-start justify-end pt-6">
                  <IconButton label={`Remove ${entry.key} binding ${index + 1}`} onClick={() => setBindings(entry.key, (list) => list.filter((_, i) => i !== index))}>
                    <Icon name="trash" size={14} />
                  </IconButton>
                </div>
                <Field label="Args" hint="One argument per line.">
                  <CodeArea rows={2} value={(binding.args ?? []).join('\n')} onChange={(e) => updateBinding(entry.key, index, (row) => ({ ...row, args: linesToArray(e.target.value) }))} />
                </Field>
                <div className="grid grid-cols-2 gap-3 md:col-span-2">
                  <Field label="Timeout (ms)" hint="Blank uses the default.">
                    <TextInput
                      mono
                      inputMode="numeric"
                      value={binding.timeoutMs !== undefined ? String(binding.timeoutMs) : ''}
                      onChange={(e) => updateBinding(entry.key, index, (row) => {
                        const digits = e.target.value.replace(/\D/g, '')
                        const { timeoutMs: _dropped, ...rest } = row
                        void _dropped
                        return digits === '' || Number(digits) <= 0 ? rest : { ...rest, timeoutMs: Number(digits) }
                      })}
                    />
                  </Field>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium">On failure</span>
                    <Segmented
                      label={`On failure for ${entry.key} binding ${index + 1}`}
                      value={binding.onFailure}
                      options={[{ value: 'deny', label: 'Deny' }, { value: 'allow', label: 'Allow' }]}
                      onChange={(onFailure) => updateBinding(entry.key, index, (row) => ({ ...row, onFailure }))}
                    />
                  </div>
                </div>
              </div>
            ))}
          </Section>
        )
      })}
    </PanelBody>
  )
}
