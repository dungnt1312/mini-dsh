import CopyButton from '../components/common/CopyButton.tsx'
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ApprovalBar } from '../components/chat/ApprovalBar.tsx'
import { Composer, ConversationDock } from '../components/composer/Composer.tsx'
import { PolicyPopover } from '../components/composer/PolicyPopover.tsx'
import { ToastHost } from '../components/common/Toast.tsx'
import { ToolCard, AssistantMessage, DelegationCard, AuditLine, UserBubble } from '../components/chat/MessageParts.tsx'
import { WorkbenchSurface } from '../components/chat/WorkbenchSurface.tsx'
import { modeLabel, errorSummary } from './copy.ts'
import { budgetTone, formatTime } from './format.ts'
import { projectItems } from './project.ts'
import { setPolicy, compactSession, fetchHooks, saveHooks, renameWorkspace } from './api.ts'
import { ContextPanel } from '../components/layout/ContextPanel.tsx'
import { InspectorPanel } from '../components/layout/InspectorPanel.tsx'
import { HooksPanel } from '../components/settings/ManagementPanels.tsx'
import { TopBar } from '../components/layout/TopBar.tsx'
import { SessionList } from '../components/session/SessionList.tsx'
import { WorkspacePopover } from '../components/layout/WorkspacePopover.tsx'
import { ErrorBoundary } from '../components/common/ErrorBoundary.tsx'
import { useToast } from '../components/common/Toast.tsx'
import { useApprovalNotify } from '../hooks/useApprovalNotify.ts'

vi.mock('./api.ts', () => ({
  setPolicy: vi.fn(async () => ({ policy: {} })),
  renameWorkspace: vi.fn(async () => ({ id: 'w1', name: 'Renamed', archived: false, createdAt: 0 })),
  setWorkspaceArchived: vi.fn(async () => ({ id: 'w1', name: 'W', archived: true, createdAt: 0 })),
  deleteWorkspace: vi.fn(async () => ({ deleted: true })),
  compactSession: vi.fn(async () => ({ coversSeq: 42, summaryChars: 900 })),
  listSkills: vi.fn(async () => []),
  saveSkill: vi.fn(async () => ({ name: 's', hash: 'h' })),
  getSkill: vi.fn(async () => ({ name: 's', title: 's', description: '', source: 'workspace' as const, hash: 'h', instructions: 'body' })),
  deleteSkill: vi.fn(async () => ({ deleted: true })),
  fetchHooks: vi.fn(async () => ({ version: 1 as const, hooks: {} })),
  saveHooks: vi.fn(async () => ({ saved: true })),
  searchMemory: vi.fn(async () => []),
  readMemory: vi.fn(async () => ({ id: 'm', title: 'm', pinned: false, createdAt: 0, updatedAt: 0, body: 'b', hash: 'h' })),
  createMemory: vi.fn(async () => ({ id: 'm', title: 'm', pinned: false, createdAt: 0, updatedAt: 0, body: 'b', hash: 'h' })),
  updateMemory: vi.fn(async () => ({ id: 'm', title: 'm', pinned: false, createdAt: 0, updatedAt: 0, body: 'b', hash: 'h2' })),
  deleteMemory: vi.fn(async () => ({ forgotten: true })),
}))

// Inspector content uses responsive primitives that need matchMedia in jsdom.
if (typeof window !== 'undefined' && window.matchMedia === undefined) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
let root: Root | undefined
let host: HTMLDivElement
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
async function mount(view: ReactNode) { host = document.createElement('div'); document.body.append(host); root = createRoot(host); await act(async () => root!.render(view)) }
afterEach(async () => { vi.clearAllMocks(); if (root) await act(async () => root!.unmount()); host?.remove(); root = undefined })
function button(text: string) { return [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text))! }
describe('mounted production controls', () => {
  it('accepts synchronous approval callbacks through the public contract', async () => {
    const answer = vi.fn()
    await mount(<ApprovalBar approvals={[{ approvalId: 'a', call: { id: 'c', name: 'bash', args: {} } }]} onAnswer={answer} />)
    await act(async () => button('Allow once').click())
    expect(answer).toHaveBeenCalledWith('a', true)
  })
  it('locks approval synchronously against double submission and shows original failure', async () => {
    let reject!: (e: Error) => void
    const answer = vi.fn(() => new Promise<void>((_, no) => { reject = no }))
    await mount(<ApprovalBar approvals={[{ approvalId: 'a', call: { id: 'c', name: 'bash', args: { command: 'exact command' } } }]} onAnswer={answer} />)
    const allow = button('Allow once')
    await act(async () => { allow.click(); allow.click() })
    expect(answer).toHaveBeenCalledTimes(1)
    expect(answer).toHaveBeenCalledWith('a', true)
    expect(button('Deny').disabled).toBe(true)
    await act(async () => reject(new Error('approval 404 resolved')))
    expect(host.textContent).toContain('no longer pending')
    expect(host.querySelector('.error-notice pre')?.textContent).toContain('approval 404 resolved')
  })
  it('IME and Shift+Enter do not send; Enter sends only an eligible draft', async () => {
    const send = vi.fn(); const stop = vi.fn()
    await mount(<ToastHost><Composer connected running={false} draft="Dữ liệu giữ nguyên" onDraft={() => {}} onSend={send} onStop={stop} modelValue="p/m" modelOptions={[]} onModel={() => {}} modes={[]} modeValue={null} onMode={() => {}} /></ToastHost>)
    const input = host.querySelector('textarea')!
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })) })
    expect(send).not.toHaveBeenCalled()
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(send).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('Dữ liệu giữ nguyên')
  })
  it('while running the send morphs into Queue and Enter still submits (queueing)', async () => {
    const send = vi.fn()
    await mount(<ToastHost><Composer connected running draft="follow-up" onDraft={() => {}} onSend={send} onStop={() => {}} modelValue="p/m" modelOptions={[]} onModel={() => {}} modes={[]} modeValue={null} onMode={() => {}} /></ToastHost>)
    const queue = host.querySelector('button[aria-label="Queue message"]') as HTMLButtonElement
    expect(queue).not.toBeNull()
    expect(queue.disabled).toBe(false)
    expect(host.querySelector('button[aria-label="Stop work"]')).not.toBeNull()
    const input = host.querySelector('textarea')!
    expect((input as HTMLTextAreaElement).placeholder).toBe('Keep typing to queue a follow-up…')
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(send).toHaveBeenCalledTimes(1)
    expect(host.querySelector('button[aria-label="Send"]')).toBeNull()
  })
  it('keeps reconnecting drafts editable and does not imply stopped work', async () => {
    const draft = 'draft survives reconnect'
    await mount(<ToastHost><Composer connected={false} running draft={draft} onDraft={() => {}} onSend={() => {}} onStop={() => {}} modelValue="p/m" modelOptions={[]} onModel={() => {}} modes={[]} modeValue={null} onMode={() => {}} /></ToastHost>)
    const input = host.querySelector<HTMLTextAreaElement>('textarea')!
    expect(input.disabled).toBe(false)
    expect(input.value).toBe(draft)
    expect(input.placeholder).toBe('Keep typing to queue a follow-up…')
    expect(host.querySelector('button[aria-label="Stop work"]')).not.toBeNull()
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Queue message"]')?.disabled).toBe(true)
  })
  it('attaches measured clearance when the transcript mounts after the dock effect', async () => {
    await mount(<div className="chat"><ConversationDock approvals={null} sendError={null} composer={<div style={{ height: 80 }}>composer</div>} /></div>)
    const chat = host.querySelector<HTMLElement>('.chat')!
    expect(chat.querySelector('.transcript')).toBeNull()
    const transcript = document.createElement('div')
    transcript.className = 'transcript'
    await act(async () => { chat.prepend(transcript); await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(Number.parseFloat(transcript.style.paddingBottom)).toBeGreaterThan(0)
  })
  it('orders approval, send error, and composer inside the measured conversation dock', async () => {
    await mount(
      <ConversationDock
        approvals={<div data-dock-item="approval">approval</div>}
        sendError={<div data-dock-item="error">error</div>}
        composer={<div data-dock-item="composer">composer</div>}
      />,
    )
    const dock = host.querySelector<HTMLElement>('[data-conversation-dock]')!
    expect([...dock.querySelectorAll('[data-dock-item]')].map((node) => node.getAttribute('data-dock-item'))).toEqual(['approval', 'error', 'composer'])
    expect(dock.className).toContain('conversation-dock')
  })
  it('tool disclosure preserves exact arguments and external output', async () => {
    await mount(<ToolCard item={{ kind: 'tool', call: { id: 'c', name: 'custom_tool', args: { path: 'C:/Dự án', secretName: 'NO_TRANSLATION' } }, result: { ok: false, output: 'lỗi từ công cụ <raw>' } }} />)
    expect(host.querySelector('pre')).toBeNull()
    await act(async () => host.querySelector('button')!.click())
    expect(host.querySelector('button')?.getAttribute('aria-expanded')).toBe('true')
    expect(host.textContent).toContain('lỗi từ công cụ <raw>')
    expect(host.querySelector('pre')?.textContent).toContain('C:/Dự án')
  })
  it('elevated workbench presents the existing recovered tool with exact disclosures', async () => {
    await mount(<WorkbenchSurface item={{ kind: 'tool', call: { id: 'c', name: 'Bash', args: { command: 'printf <raw>' } }, result: { ok: true, output: 'recorded <output>' }, recovered: true }} workspaceId="w1" onOpenChild={() => {}} />)
    expect(host.querySelector('[data-workbench-surface]')?.textContent).toContain('Outcome unknown — the host restarted before this result was recorded.')
    expect(host.querySelector('pre')?.textContent).toContain('printf <raw>')
    expect(host.textContent).toContain('recorded <output>')
  })
  it('elevated running tool does not synthesize an output disclosure', async () => {
    await mount(<WorkbenchSurface item={{ kind: 'tool', call: { id: 'c', name: 'Bash', args: { command: 'npm test' } } }} workspaceId="w1" onOpenChild={() => {}} />)
    expect(host.textContent).toContain('Running')
    expect(host.textContent).not.toContain('Output')
    expect(host.querySelectorAll('pre')).toHaveLength(1)
  })
  it('elevated delegation opens the existing child conversation callback', async () => {
    const onOpenChild = vi.fn()
    await mount(<WorkbenchSurface item={{ kind: 'delegation', childSessionId: 'child-1', definition: 'explorer', objective: 'Map auth', status: 'running' }} workspaceId="w1" onOpenChild={onOpenChild} />)
    await act(async () => button('Open conversation').click())
    expect(onOpenChild).toHaveBeenCalledWith('child-1')
  })
})
describe('presentation ownership', () => {  it('maps only bundled mode labels and preserves custom names even for a familiar ID', () => {
    expect(modeLabel({ id: 'plan', name: 'Kế hoạch', source: 'bundled' })).toBe('Plan')
    expect(modeLabel({ id: 'plan', name: 'Kế hoạch riêng', source: 'workspace' })).toBe('Kế hoạch riêng')
  })
  it('formats only verified dates in explicit English', () => {
    expect(formatTime()).toBe('')
    expect(formatTime(1789120800000)).toMatch(/AM|PM/)
  })
  it.each(['archived workspace', 'cannot delete running conversation', 'no provider configured', 'invalid project path', 'Failed to fetch', 'unknown external error'])('provides English guidance without modifying diagnostics: %s', raw => {
    expect(errorSummary(raw)).not.toMatch(/[À-ỹ]/)
    expect(errorSummary(raw).length).toBeGreaterThan(20)
  })
})


describe('permission policy popover', () => {
  it('stages changes, marks the trigger dirty, and saves the whole workspace policy', async () => {
    const saved = vi.fn()
    await mount(<ToastHost><PolicyPopover policy={{ bash: 'ask' }} workspaceId="w1" onSaved={saved} /></ToastHost>)
    const trigger = host.querySelector<HTMLButtonElement>('.composer-policy-trigger')!
    expect(trigger.querySelector('.policy-dot')).toBeNull()
    await act(async () => trigger.click())
    const wildcardAllow = [...document.body.querySelectorAll<HTMLButtonElement>('.ui-segment')].find(b => b.textContent === 'Allow')!
    await act(async () => wildcardAllow.click())
    expect(host.querySelector('.policy-dot')).not.toBeNull()
    const save = [...document.body.querySelectorAll<HTMLButtonElement>('.policy-foot button')].find(b => b.textContent === 'Save')!
    expect(save.disabled).toBe(false)
    await act(async () => save.click())
    expect(setPolicy).toHaveBeenCalledWith('w1', { '*': 'allow', bash: 'ask' })
    expect(saved).toHaveBeenCalledTimes(1)
  })
  it('keeps staged policy changes after closing and reopening the popover', async () => {
    await mount(<ToastHost><PolicyPopover policy={{ bash: 'ask' }} workspaceId="w1" /></ToastHost>)
    const trigger = host.querySelector<HTMLButtonElement>('.composer-policy-trigger')!
    await act(async () => trigger.click())
    const wildcardAllow = [...document.body.querySelectorAll<HTMLButtonElement>('.ui-segment')].find(b => b.textContent === 'Allow')!
    await act(async () => wildcardAllow.click())
    expect(host.querySelector('.policy-dot')).not.toBeNull()
    await act(async () => document.body.querySelector<HTMLElement>('.policy-pop')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    await act(async () => trigger.click())
    const selectedAllow = [...document.body.querySelectorAll<HTMLButtonElement>('.ui-segment-active')].find(b => b.textContent === 'Allow')
    expect(selectedAllow).not.toBeUndefined()
    expect(host.querySelector('.policy-dot')).not.toBeNull()
  })
  it('keeps the dialog-bound editor honest: Reset restores the saved policy', async () => {
    await mount(<ToastHost><PolicyPopover policy={{ bash: 'ask' }} workspaceId="w1" /></ToastHost>)
    await act(async () => host.querySelector<HTMLButtonElement>('.composer-policy-trigger')!.click())
    const deny = [...document.body.querySelectorAll<HTMLButtonElement>('.ui-segment')].find(b => b.textContent === 'Deny')!
    await act(async () => deny.click())
    const reset = [...document.body.querySelectorAll<HTMLButtonElement>('.policy-foot button')].find(b => b.textContent === 'Reset')!
    await act(async () => reset.click())
    expect(host.querySelector('.policy-dot')).toBeNull()
    expect(setPolicy).not.toHaveBeenCalled()
  })
})

describe('always-allow approval flow', () => {
  it('persists the policy change and answers the approval on confirm', async () => {
    const always = vi.fn(async () => undefined)
    const answer = vi.fn(async () => undefined)
    await mount(<ApprovalBar approvals={[{ approvalId: 'a', call: { id: 'c', name: 'bash', args: { command: 'ls' } } }]} onAnswer={answer} workspaceName="Acme" onAlwaysAllow={always} />)
    await act(async () => button('Always allow bash…').click())
    expect(document.body.textContent).toContain('Always allow "bash" in Acme?')
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('.confirm-actions button')].find(b => b.textContent === 'Allow always')!
    await act(async () => confirm.click())
    expect(always).toHaveBeenCalledWith('bash')
    expect(answer).toHaveBeenCalledWith('a', true)
    expect(document.body.textContent).not.toContain('Always allow "bash" in Acme?')
  })
  it('locks persistent allow confirmation synchronously against double submission', async () => {
    let resolve!: () => void
    const always = vi.fn(() => new Promise<void>((done) => { resolve = done }))
    const answer = vi.fn(async () => undefined)
    await mount(<ApprovalBar approvals={[{ approvalId: 'a', call: { id: 'c', name: 'bash', args: {} } }]} onAnswer={answer} onAlwaysAllow={always} />)
    await act(async () => button('Always allow bash…').click())
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('.confirm-actions button')].find(b => b.textContent === 'Allow always')!
    await act(async () => { confirm.click(); confirm.click() })
    expect(always).toHaveBeenCalledTimes(1)
    expect(answer).not.toHaveBeenCalled()
    await act(async () => resolve())
    expect(answer).toHaveBeenCalledTimes(1)
    expect(answer).toHaveBeenCalledWith('a', true)
  })
  it('keeps the confirm open with the error when the policy write fails', async () => {
    const always = vi.fn(async () => { throw new Error('policy 409 refused') })
    const answer = vi.fn(async () => undefined)
    await mount(<ApprovalBar approvals={[{ approvalId: 'a', call: { id: 'c', name: 'bash', args: {} } }]} onAnswer={answer} onAlwaysAllow={always} />)
    await act(async () => button('Always allow bash…').click())
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('.confirm-actions button')].find(b => b.textContent === 'Allow always')!
    await act(async () => confirm.click())
    expect(document.body.querySelector('.error-notice')?.textContent).toContain('policy 409 refused')
    expect(document.body.textContent).toContain('Always allow "bash"')
    expect(answer).not.toHaveBeenCalled()
  })
  it('hides Always allow without a workspace context (existing two-action contract)', async () => {
    const answer = vi.fn(async () => undefined)
    await mount(<ApprovalBar approvals={[{ approvalId: 'a', call: { id: 'c', name: 'bash', args: {} } }]} onAnswer={answer} />)
    expect(button('Allow once')).not.toBeNull()
    expect(host.textContent).not.toContain('Always allow')
  })
})

describe('queued input projection', () => {
  it('renders the queued twin and replaces it in place by the consuming message', () => {
    const items = projectItems([
      { type: 'turn/start', seq: 0 },
      { type: 'input/queued', seq: 1, inputId: 'i1', content: 'Run the migration' },
      { type: 'user/message', seq: 2, inputId: 'i1', content: 'Run the migration' },
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'user', content: 'Run the migration', queued: false })
  })
  it('keeps the twin queued until its own inputId is consumed', () => {
    const items = projectItems([
      { type: 'input/queued', seq: 0, inputId: 'i1', content: 'First' },
      { type: 'input/queued', seq: 1, inputId: 'i2', content: 'Second' },
      { type: 'user/message', seq: 2, inputId: 'i1', content: 'First' },
    ])
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ content: 'First', queued: false })
    expect(items[1]).toMatchObject({ content: 'Second', queued: true })
  })
})

describe('transcript truthfulness', () => {
  const assistant = (controls?: { model?: string; provider?: string }) => ({
    kind: 'assistant' as const, content: 'answer', live: false, thinking: [] as string[], thinkingLive: false,
    ...(controls !== undefined ? { controls } : {}),
  })
  it('reports the controls that served the message before the workspace fallback', async () => {
    await mount(<AssistantMessage item={assistant({ model: 'deepseek-v3', provider: 'dntproxy' })} modelLabel="workspace-model" />)
    expect(host.querySelector('.meta-model')?.textContent).toBe('deepseek-v3 · dntproxy')
    await mount(<AssistantMessage item={assistant()} modelLabel="workspace-model" />)
    expect(host.querySelector('.meta-model')?.textContent).toBe('workspace-model')
  })
  it('renders a recovered tool result as amber unknown, never failed', async () => {
    await mount(<ToolCard item={{ kind: 'tool', call: { id: 'c', name: 'Bash', args: { command: 'npm install' } }, result: { ok: true, output: 'partial output' }, recovered: true }} />)
    const row = host.querySelector('.tool-row')!
    expect(row.className).toContain('recovered')
    expect(row.querySelector('.verdict-recovered')).not.toBeNull()
    expect(row.querySelector('.verdict-failed')).toBeNull()
    expect(host.textContent).toContain('recovered')
    await act(async () => host.querySelector<HTMLButtonElement>('.tool-head')!.click())
    expect(host.querySelector('.tool-recovery-note')?.textContent).toContain('Outcome unknown')
    expect(host.querySelector('.tool-recovery-note')?.textContent).not.toContain('partial output')
  })
  it('carries the MCP server chip parsed from the mcp__server__tool call name', async () => {
    await mount(<ToolCard item={{ kind: 'tool', call: { id: 'c', name: 'mcp__docs__search', args: { q: 'x' } }, result: { ok: true, output: 'hit' }, server: 'docs' }} />)
    expect([...host.querySelectorAll('.ui-code-chip, code')].some(chip => chip.textContent === 'docs')).toBe(true)
  })
  it('shows the delegation timeline and opens the child conversation', async () => {
    const onOpen = vi.fn()
    await mount(<DelegationCard item={{ kind: 'delegation', childSessionId: 'child-1', definition: 'explorer', objective: 'Map auth modules', status: 'completed' }} workspaceId={null} onOpen={onOpen} />)
    expect(host.querySelector('.tool-head')?.textContent).toContain('Delegated to explorer')
    expect(host.querySelector('.tool-head')?.textContent).toContain('Map auth modules')
    expect(host.querySelector('.verdict-ok')).not.toBeNull()
    await act(async () => host.querySelector<HTMLButtonElement>('.tool-head')!.click())
    expect(host.querySelector('.delegation-label')?.textContent).toContain('Objective')
    await act(async () => host.querySelector<HTMLButtonElement>('.delegation-open')!.click())
    expect(onOpen).toHaveBeenCalledWith('child-1')
  })
  it('keeps a running delegation silent about its result until settled', async () => {
    await mount(<DelegationCard item={{ kind: 'delegation', childSessionId: 'child-2', definition: 'coder', objective: 'Fix', status: 'running' }} workspaceId={null} onOpen={() => {}} />)
    expect(host.querySelector('.tool-spin')).not.toBeNull()
    await act(async () => host.querySelector<HTMLButtonElement>('.tool-head')!.click())
    expect(host.textContent).not.toContain('Result (')
  })
  it('renders audit lines with tone icons and no raw uuid decisions', async () => {
    await mount(<AuditLine item={{ kind: 'audit', icon: 'block', text: 'hook blocked · PreToolUse · Bash*', durationMs: 120 }} />)
    expect(host.querySelector('.verdict-recovered')).not.toBeNull()
    expect(host.querySelector('.audit-text')?.textContent).toBe('hook blocked · PreToolUse · Bash*')
    expect(host.querySelector('.tool-duration')?.textContent).toBe('120ms')
  })
  it('offers copy and reuse on real user messages, never on queued twins', async () => {
    const onReuse = vi.fn()
    await mount(<UserBubble item={{ kind: 'user', content: 'Run the migration' }} onReuse={onReuse} />)
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Reuse in composer"]')!.click())
    expect(onReuse).toHaveBeenCalledWith('Run the migration')
    await mount(<UserBubble item={{ kind: 'user', content: 'Queued work', queued: true }} onReuse={onReuse} />)
    expect(host.querySelector('button[aria-label="Reuse in composer"]')).toBeNull()
    expect(host.querySelector('.queued-chip')?.textContent).toBe('Queued')
  })
})

describe('projection of delegation, hook and approval events', () => {
  it('pairs spawn with result, marks interrupted on parent end, and drops allowing hooks', () => {
    const items = projectItems([
      { type: 'agent/child-spawn', seq: 0, childSessionId: 'ch1', definition: 'explorer', objective: 'Map' },
      { type: 'hook/run', seq: 1, event: 'PreToolUse', matcher: 'Bash*', exitCode: 1, durationMs: 40, decision: 'allow' },
      { type: 'hook/run', seq: 2, event: 'PreToolUse', matcher: 'Bash*', exitCode: 2, durationMs: 40, decision: 'block' },
      { type: 'agent/child-spawn', seq: 3, childSessionId: 'ch2', definition: 'coder', objective: 'Fix' },
      { type: 'turn/end', seq: 4, reason: 'completed' },
      { type: 'agent/child-result', seq: 5, childSessionId: 'ch1', status: 'completed' },
    ])
    const delegations = items.filter(item => item.kind === 'delegation')
    expect(delegations[0]).toMatchObject({ childSessionId: 'ch1', status: 'completed' })
    expect(delegations[1]).toMatchObject({ childSessionId: 'ch2', status: 'interrupted' })
    const audits = items.filter(item => item.kind === 'audit')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ icon: 'block' })
  })
  it('correlates an approval decision with its request into one quiet line', () => {
    const items = projectItems([
      { type: 'approval/request', seq: 0, approvalId: 'a9', call: { id: 'c', name: 'Bash', args: { command: 'rm -rf build' } } },
      { type: 'approval/decision', seq: 1, approvalId: 'a9', decision: 'deny' },
    ])
    expect(items.filter(item => item.kind === 'audit')).toContainEqual({ kind: 'audit', icon: 'deny', text: 'Denied · Bash · rm -rf build' })
    expect(items.some(item => item.kind === 'status' && item.reason.includes('a9'))).toBe(false)
  })
  it('flags recovered tool results and never renders mcp/call as its own row', () => {
    const items = projectItems([
      { type: 'tool/call', seq: 0, call: { id: 'c1', name: 'mcp__docs__search', args: {} } },
      { type: 'mcp/call', seq: 1, server: 'docs', tool: 'search', argsHash: 'a', resultHash: 'r', durationMs: 12, isError: false },
      { type: 'tool/result', seq: 2, callId: 'c1', ok: true, output: 'ok', recovery: true },
    ])
    expect(items.filter(item => item.kind === 'tool')).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'tool', server: 'docs', recovered: true })
  })
})

describe('inspector compaction + budget bar', () => {
  const manifest = {
    modeId: 'plan', modeRevision: 3,
    budget: { availableTokens: 128000, usedTokens: 48000, estimated: true },
    history: { setting: 'all', includedTurns: 12, omittedTurns: 0 },
    sources: { skills: ['deploy-notes'], memory: [], toolNames: ['Bash'], toolSchemas: 1 },
    omissions: [],
  }
  it('computes the state-colored budget tone thresholds', () => {
    expect(budgetTone(0, 100)).toBe('ok')
    expect(budgetTone(79, 100)).toBe('ok')
    expect(budgetTone(80, 100)).toBe('warn')
    expect(budgetTone(94, 100)).toBe('warn')
    expect(budgetTone(95, 100)).toBe('bad')
    expect(budgetTone(10, 0)).toBe('bad')
  })
  it('compacts through the confirm dialog and reports the checkpoint outcome', async () => {
    await mount(
      <ToastHost>
        <ContextPanel meta={null} stream="open" sessionId="s1" sessionFolder={null} eventCount={0} manifest={manifest} workspaceId="w1" running={false} />
      </ToastHost>,
    )
    expect(host.querySelector('.budget-bar')).not.toBeNull()
    expect(host.querySelector('.env-compact')?.textContent).toBe('Compact…')
    await act(async () => host.querySelector<HTMLButtonElement>('.env-compact')!.click())
    expect(document.body.textContent).toContain('Compact this conversation?')
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('.confirm-actions button')].find(b => b.textContent === 'Compact')!
    await act(async () => confirm.click())
    expect(compactSession).toHaveBeenCalledWith('w1', 's1')
    expect(document.body.textContent).not.toContain('Compact this conversation?')
  })
  it('disables compaction while a turn runs', async () => {
    await mount(
      <ToastHost>
        <ContextPanel meta={null} stream="open" sessionId="s1" sessionFolder={null} eventCount={0} manifest={manifest} workspaceId="w1" running />
      </ToastHost>,
    )
    const button = host.querySelector<HTMLButtonElement>('.env-compact')!
    expect(button.disabled).toBe(true)
    expect(button.title).toBe('Stop the turn first')
  })
  it('invalidates an open compact confirmation when the turn starts and never executes compaction', async () => {
    function Probe() {
      const [running, setRunning] = useState(false)
      return (
        <ToastHost>
          <button type="button" onClick={() => setRunning(true)}>Start running</button>
          <ContextPanel meta={null} stream="open" sessionId="s1" sessionFolder={null} eventCount={0} manifest={manifest} workspaceId="w1" running={running} />
        </ToastHost>
      )
    }
    await mount(<Probe />)
    await act(async () => host.querySelector<HTMLButtonElement>('.env-compact')!.click())
    expect(document.body.textContent).toContain('Compact this conversation?')
    await act(async () => button('Start running').click())
    expect(document.body.textContent).not.toContain('Compact this conversation?')
    expect(compactSession).not.toHaveBeenCalled()
  })
  it('renders the workspace mode row in effective controls', async () => {
    await mount(<ToastHost><ContextPanel meta={null} stream="open" sessionId={null} sessionFolder={null} eventCount={0} modeLabel="Plan" /></ToastHost>)
    const rows = [...host.querySelectorAll('.env-row')].map(row => row.textContent)
    expect(rows.some(text => text?.startsWith('mode'))).toBe(true)
    expect(host.textContent).toContain('Plan')
  })
  it('renders persisted Radix inspector tabs and exact artifact states from existing events', async () => {
    const onTabChange = vi.fn()
    const events = [
      { type: 'tool/call', seq: 0, call: { id: 'file', name: 'Read', args: { path: 'C:/repo/README.md' } } },
      { type: 'tool/result', seq: 1, callId: 'file', ok: true, output: '# README' },
      { type: 'tool/call', seq: 2, call: { id: 'command', name: 'Bash', args: { command: 'npm test' } } },
      { type: 'tool/result', seq: 3, callId: 'command', ok: false, output: 'failed output' },
      { type: 'tool/call', seq: 4, call: { id: 'output', name: 'custom', args: {} } },
      { type: 'tool/result', seq: 5, callId: 'output', ok: true, output: 'custom output' },
      { type: 'tool/call', seq: 6, call: { id: 'pending', name: 'Read', args: { file_path: 'C:/repo/pending.ts' } } },
      { type: 'tool/call', seq: 7, call: { id: 'recovered', name: 'Read', args: { path: 'C:/repo/recovered.ts' } } },
      { type: 'tool/result', seq: 8, callId: 'recovered', ok: true, output: 'partial', recovery: true },
    ] as const
    await mount(<ToastHost><InspectorPanel tab="artifacts" onTabChange={onTabChange} onClose={() => {}} context={{ meta: null, stream: 'open', sessionId: 's1', sessionFolder: null, eventCount: events.length }} events={events} /></ToastHost>)
    expect(host.querySelector('[role="tablist"]')).not.toBeNull()
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Artifacts')
    const list = host.querySelector('[aria-label="Recorded artifacts"]')!
    expect(list.textContent).toContain('File reference')
    expect(list.textContent).toContain('C:/repo/README.md')
    expect(list.textContent).toContain('Command record')
    expect(list.textContent).toContain('npm test')
    expect(list.textContent).toContain('failed')
    expect(list.textContent).toContain('custom output')
    expect(list.textContent).toContain('pending')
    expect(list.textContent).toContain('Outcome unknown — the host restarted before this result was recorded.')
    expect(list.textContent).not.toMatch(/file content|diff|changed files|terminal/i)
  })
  it('renders the exact artifacts empty state', async () => {
    await mount(<ToastHost><InspectorPanel tab="artifacts" onTabChange={() => {}} context={{ meta: null, stream: 'idle', sessionId: null, sessionFolder: null, eventCount: 0 }} events={[]} /></ToastHost>)
    expect(host.textContent).toContain('No recorded artifacts for this conversation yet.')
  })
  it('hooks raw editor keeps an invalid document intact and refuses to apply or save it', async () => {
    ;(fetchHooks as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ version: 1, hooks: {} })
    await mount(<ToastHost><HooksPanel workspaceId="ws-1" /></ToastHost>)
    await act(async () => button('Advanced · edit raw JSON').click())
    const raw = host.querySelector<HTMLTextAreaElement>('textarea.manage-code-tall')!
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      setNativeValue.call(raw, '{}')
      raw.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('Apply raw').click())
    expect(host.textContent).toContain('Hooks validation error: version must be 1')
    expect(host.querySelector<HTMLTextAreaElement>('textarea.manage-code-tall')?.value).toBe('{}')
    expect(button('Apply raw')).not.toBeUndefined()
    expect(saveHooks).not.toHaveBeenCalled()
  })

  it.each([
    ['unknown top-level key', '{\n  "version": 1,\n  "hooks": {},\n  "extra": true\n}', 'unknown top-level key "extra"'],
    ['unknown binding key', '{"version":1,"hooks":{"PreToolUse":[{"matcher":"*","type":"command","command":"node guard.mjs","onFailure":"deny","extra":true}]}}', 'PreToolUse[0] has unknown key "extra"'],
  ])('hooks raw editor keeps %s verbatim/open and issues zero PUT', async (_case, draft, error) => {
    ;(fetchHooks as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ version: 1, hooks: {} })
    await mount(<ToastHost><HooksPanel workspaceId="ws-1" /></ToastHost>)
    await act(async () => button('Advanced · edit raw JSON').click())
    const raw = host.querySelector<HTMLTextAreaElement>('textarea.manage-code-tall')!
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      setNativeValue.call(raw, draft)
      raw.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('Apply raw').click())
    expect(host.textContent).toContain(error)
    expect(host.querySelector<HTMLTextAreaElement>('textarea.manage-code-tall')?.value).toBe(draft)
    expect(button('Apply raw')).not.toBeUndefined()
    expect(saveHooks).not.toHaveBeenCalled()
  })

  it('hooks raw editor validates then saves the exact whole document', async () => {
    ;(fetchHooks as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ version: 1, hooks: {} })
    await mount(<ToastHost><HooksPanel workspaceId="ws-1" /></ToastHost>)
    await act(async () => button('Advanced · edit raw JSON').click())
    const raw = host.querySelector<HTMLTextAreaElement>('textarea.manage-code-tall')!
    const document = { version: 1 as const, hooks: { UserPromptSubmit: [{ matcher: '*', type: 'command' as const, command: 'node prompt.mjs', args: ['--safe'], timeoutMs: 700, onFailure: 'deny' as const }] } }
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      setNativeValue.call(raw, JSON.stringify(document))
      raw.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('Apply raw').click())
    await act(async () => button('Save hooks').click())
    expect(saveHooks).toHaveBeenCalledWith('ws-1', document)
  })

  it('hooks editor lists every event section and saves the edited document', async () => {
    ;(fetchHooks as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      version: 1,
      hooks: { PreToolUse: [{ matcher: 'Bash*', type: 'command' as const, command: 'node guard.mjs', onFailure: 'deny' as const }] },
    })
    await mount(<ToastHost><HooksPanel workspaceId="ws-1" /></ToastHost>)
    for (const label of ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'SessionStart', 'SessionEnd', 'PreCompact']) {
      expect(host.textContent).toContain(label)
    }
    const matcher = host.querySelector<HTMLInputElement>('.hooks-binding input')!
    expect(matcher.value).toBe('Bash*')
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setNativeValue.call(matcher, 'Bash')
      matcher.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const save = [...host.querySelectorAll('button')].find(b => b.textContent === 'Save hooks')!
    await act(async () => save.click())
    expect(saveHooks).toHaveBeenCalledWith('ws-1', expect.objectContaining({
      hooks: expect.objectContaining({
        PreToolUse: [expect.objectContaining({ matcher: 'Bash', command: 'node guard.mjs' })],
      }),
    }))
  })
})

describe('sidebar sections + live rows + workspace management', () => {
  const project = { id: 'p1', name: 'Acme', workspaceId: 'w1', path: 'C:/acme', createdAt: 1 }
  const base = { updatedAt: Date.now(), eventCount: 3, folder: null }
  const sessions = [
    { id: 's1', title: 'Auth refactor', projectId: 'p1', status: 'running' as const, activity: 'model' as const, pendingInputs: 0, ...base },
    { id: 's2', title: 'Crash fix', projectId: 'p1', status: 'idle' as const, pendingInputs: 2, ...base },
    { id: 's3', title: 'Loose chat', status: 'idle' as const, pendingInputs: 0, ...base },
  ] as const
  it('groups by project with running counts and keeps loose conversations bucketed', async () => {
    await mount(<SessionList sessions={[...sessions]} projects={[project]} current={null} filter="" liveRunning={false} onSelect={() => {}} onRename={() => {}} onDeleteRequest={() => {}} onNewInProject={() => {}} />)
    expect(host.textContent).toContain('Acme')
    expect(host.querySelector('.project-running')?.textContent).toBe('●1')
    expect(host.textContent).toContain('CONVERSATIONS')
    expect(host.textContent).toContain('working with model')
    expect(host.textContent).toContain('2 queued')
  })
  it('offers per-project quick-new and filters by title', async () => {
    const onNewInProject = vi.fn()
    await mount(<SessionList sessions={[...sessions]} projects={[project]} current={null} filter="crash" liveRunning={false} onSelect={() => {}} onRename={() => {}} onDeleteRequest={() => {}} onNewInProject={onNewInProject} />)
    expect(host.textContent).toContain('Crash fix')
    expect(host.textContent).not.toContain('Auth refactor')
    await act(async () => host.querySelector<HTMLButtonElement>('.project-head + * button, .project-head button[aria-label^="New conversation in"]')!.click())
    expect(onNewInProject).toHaveBeenCalledWith('p1')
  })
  it('marks the amber approval badge as the chip’s only attention signal', async () => {
    const workspaces = [
      { id: 'w1', name: 'Acme', archived: false, createdAt: 1, default: true, running: 2, approvals: 1 },
      { id: 'w2', name: 'Lab', archived: true, createdAt: 2, running: 0, approvals: 0 },
    ]
    await mount(<TopBar stream="open" sidebarOpen workspaces={workspaces} activeWorkspaceId="w1" newWorkspaceName="" onNewWorkspaceName={() => {}} onSelectWorkspace={() => {}} onCreateWorkspace={() => {}} onWorkspacesChanged={async () => {}} onToggleSidebar={() => {}} onToggleEnv={() => {}} onOpenSettings={() => {}} />)
    const chip = host.querySelector('.topbar-workspace')!
    expect(chip.textContent).toContain('Acme')
    expect(chip.querySelector('.ui-badge')?.textContent).toBe('⚠1')
    expect(chip.textContent).not.toContain('running')
    await mount(<TopBar stream="open" sidebarOpen workspaces={[workspaces[1]!]} activeWorkspaceId="w2" newWorkspaceName="" onNewWorkspaceName={() => {}} onSelectWorkspace={() => {}} onCreateWorkspace={() => {}} onWorkspacesChanged={async () => {}} onToggleSidebar={() => {}} onToggleEnv={() => {}} onOpenSettings={() => {}} />)
    expect(host.querySelector('.topbar-workspace')?.textContent).toContain('archived')
  })
  it('renames a workspace inline through the API', async () => {
    const onChanged = vi.fn(async () => {})
    const workspaces = [{ id: 'w1', name: 'Old', archived: false, createdAt: 1 }]
    await mount(<ToastHost><WorkspacePopover workspaces={workspaces} activeWorkspaceId="w1" onSelect={() => {}} onChanged={onChanged} newWorkspaceName="" onNewWorkspaceName={() => {}} onCreate={() => {}} /></ToastHost>)
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Rename Old"]')!.click())
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Workspace name"]')!
    const setNative = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setNative.call(input, 'Renamed')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Save workspace name"]')!.click())
    expect(renameWorkspace).toHaveBeenCalledWith('w1', 'Renamed')
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
  it('disables Archive in the kebab menu while sessions run', async () => {
    const workspaces = [{ id: 'w1', name: 'Busy', archived: false, createdAt: 1, running: 1, approvals: 0 }]
    await mount(<ToastHost><WorkspacePopover workspaces={workspaces} activeWorkspaceId="w1" onSelect={() => {}} onChanged={async () => {}} newWorkspaceName="" onNewWorkspaceName={() => {}} onCreate={() => {}} /></ToastHost>)
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Manage Busy"]')!.click())
    const menu = document.body.querySelector('.ws-menu')!
    const archive = [...menu.querySelectorAll('button')].find(b => b.textContent === 'Archive') as HTMLButtonElement
    expect(archive.disabled).toBe(true)
    expect(archive.title).toBe('Stop running sessions first')
  })
})

describe('global feedback', () => {
  function Boom(): null {
    throw new Error('render exploded')
  }
  it('catches render crashes in a neutral boundary that never blames the data', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await mount(<ErrorBoundary><Boom /></ErrorBoundary>)
      await act(async () => {}) // let the recovered commit flush
      expect(host.querySelector('.error-boundary-card')).not.toBeNull()
      expect(host.textContent).toContain('The conversation data is safe on the server.')
      expect(host.querySelector('.error-boundary-icon')).not.toBeNull()
      expect(host.textContent).toContain('render exploded')
    } finally {
      spy.mockRestore()
    }
  })
  it('renders toast variants with their state icon and ttl contract', async () => {
    const probe: { notify?: (text: string, kind?: 'ok' | 'bad' | 'info') => void } = {}
    function Probe(): null {
      const toast = useToast()
      probe.notify = toast.notify
      return null
    }
    await mount(<ToastHost><Probe /></ToastHost>)
    await act(async () => probe.notify?.('Saved successfully.', 'ok'))
    expect(host.querySelector('.toast-icon-ok')).not.toBeNull()
    await act(async () => probe.notify?.('Broken input.', 'bad'))
    expect(host.querySelector('.toast-icon-bad')).not.toBeNull()
    await act(async () => probe.notify?.('Plain information.', 'info'))
    expect(host.querySelectorAll('.toast')).toHaveLength(3)
  })
  it('keeps the bell notification honest: enabled only after granted permission', async () => {
    let latest: { enabled: boolean; blocked: boolean; toggle: () => void } | undefined
    function Probe(): null {
      const notify = useApprovalNotify([], 'Acme')
      latest = notify
      return null
    }
    ;(globalThis as any).Notification = { permission: 'denied', requestPermission: async () => 'denied' }
    try {
      window.localStorage?.setItem('notify-approvals', '0')
      await mount(<Probe />)
      expect(latest?.enabled).toBe(false)
      await act(async () => latest?.toggle())
      expect(latest?.enabled).toBe(false)
      expect(latest?.blocked).toBe(true)
    } finally {
      delete (globalThis as any).Notification
    }
  })
})

describe('no-modal new-chat flow (composer scope picker)', () => {
  const options = [
    { id: null, name: 'Chat only', path: 'No project folder — chat without file or shell tools' },
    { id: 'p1', name: 'Acme', path: 'C:/acme' },
  ]
  it('renders the picker trigger with the selected label in draft mode', async () => {
    await mount(<ToastHost><Composer connected running={false} draft="" onDraft={() => {}} onSend={() => {}} onStop={() => {}} modelValue="p/m" modelOptions={[]} onModel={() => {}} modes={[]} modeValue={null} onMode={() => {}} scopePicker={{ value: 'p1', options, onChange: () => {}, onPickFolder: () => {} }} /></ToastHost>)
    const chip = host.querySelector('.scope-chip-picking')!
    expect(chip.textContent).toContain('Acme')
    expect(chip.getAttribute('aria-haspopup')).toBe('menu')
  })
  it('lists projects with paths and reports the changed scope', async () => {
    const onChange = vi.fn()
    await mount(<ToastHost><Composer connected running={false} draft="" onDraft={() => {}} onSend={() => {}} onStop={() => {}} modelValue="p/m" modelOptions={[]} onModel={() => {}} modes={[]} modeValue={null} onMode={() => {}} scopePicker={{ value: null, options, onChange, onPickFolder: () => {} }} /></ToastHost>)
    await act(async () => host.querySelector<HTMLButtonElement>('.scope-chip-picking')!.click())
    const rows = [...document.body.querySelectorAll('.scope-menu .scope-option')]
    expect(rows).toHaveLength(2)
    expect(document.body.querySelector('.scope-menu')?.textContent).toContain('C:/acme')
    await act(async () => (rows[1] as HTMLButtonElement).click())
    expect(onChange).toHaveBeenCalledWith('p1')
  })
  it('switches to Chat only with null and opens the folder picker from the footer', async () => {
    const onChange = vi.fn()
    const onPickFolder = vi.fn()
    await mount(<ToastHost><Composer connected running={false} draft="" onDraft={() => {}} onSend={() => {}} onStop={() => {}} modelValue="p/m" modelOptions={[]} onModel={() => {}} modes={[]} modeValue={null} onMode={() => {}} scopePicker={{ value: 'p1', options, onChange, onPickFolder }} /></ToastHost>)
    await act(async () => host.querySelector<HTMLButtonElement>('.scope-chip-picking')!.click())
    const chatOnly = [...document.body.querySelectorAll('.scope-menu .scope-option')].find(b => b.textContent?.includes('Chat only')) as HTMLButtonElement
    await act(async () => chatOnly.click())
    expect(onChange).toHaveBeenCalledWith(null)
    await act(async () => host.querySelector<HTMLButtonElement>('.scope-chip-picking')!.click())
    // The footer defers to the server-backed folder picker modal.
    const footer = document.body.querySelector<HTMLButtonElement>('.scope-menu .scope-register-row')!
    expect(footer.textContent).toContain('Choose folder')
    await act(async () => footer.click())
    expect(onPickFolder).toHaveBeenCalledTimes(1)
  })
  it('falls back to the read-only scope display once a conversation is open', async () => {
    await mount(<ToastHost><Composer scope="C:/acme" connected running={false} draft="" onDraft={() => {}} onSend={() => {}} onStop={() => {}} modelValue="p/m" modelOptions={[]} onModel={() => {}} modes={[]} modeValue={null} onMode={() => {}} /></ToastHost>)
    expect(host.querySelector('.scope-chip-picking')).toBeNull()
    expect(host.querySelector('.scope-chip')?.textContent).toContain('acme')
    expect(host.querySelector('.scope-cta')).toBeNull()
  })
})

describe('mounted clipboard recovery', () => {
  it('announces rejection and supports a successful manual retry without changing text', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValueOnce(undefined)
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    try {
      await mount(<CopyButton text="Dữ liệu nguyên bản" />)
      expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Copy to clipboard')
      await act(async () => host.querySelector('button')!.click())
      expect(host.querySelector('[role=status]')?.textContent).toContain('Could not copy')
      await act(async () => host.querySelector('button')!.click())
      expect(host.querySelector('[role=status]')).toBeNull()
      expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Copied to clipboard')
      expect(writeText).toHaveBeenNthCalledWith(2, 'Dữ liệu nguyên bản')
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original)
      else Reflect.deleteProperty(navigator, 'clipboard')
    }
  })
})
