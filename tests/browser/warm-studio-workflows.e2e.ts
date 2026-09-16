import { expect, test, type Page, type Route } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const screenshotRoot = fileURLToPath(new URL('../../artifacts/product-ui/warm-studio', import.meta.url))
const REQUIRED_WIDTHS = [320, 375, 768, 1024, 1440, 1920] as const
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'] as const

type FixtureState = 'no-workspace' | 'running-tool' | 'completed-tool' | 'recovered-tool' | 'artifacts' | 'delegation' | 'no-work' | 'approval' | 'late-transcript' | 'reconnect' | 'new-conversation' | 'new-conversation-success' | 'settings'

interface RequestRecord {
  readonly method: string
  readonly path: string
  readonly body: unknown
}

interface Fixture {
  readonly requests: () => readonly RequestRecord[]
  readonly count: (method: string, path: string) => number
}

const SESSION_PATH = '/api/workspaces/w/sessions/s'
const EVENTS_PATH = `${SESSION_PATH}/events`

function fixtureEvents(state: FixtureState): readonly unknown[] {
  if (state === 'running-tool' || state === 'reconnect') return [
    { type: 'turn/start', seq: 0 },
    { type: 'user/message', seq: 1, content: 'Run the active task' },
    { type: 'tool/call', seq: 2, call: { id: 'tool', name: 'Bash', args: { command: 'npm test' } } },
  ]
  if (state === 'late-transcript') return Array.from({ length: 12 }, (_, index) => ({ type: 'user/message', seq: index, content: `Late transcript item ${index + 1}\n${'late content '.repeat(20)}` }))
  if (state === 'completed-tool') return [
    ...Array.from({ length: 18 }, (_, index) => ({ type: 'user/message', seq: index, content: `Transcript item ${index + 1}` })),
    { type: 'tool/call', seq: 18, call: { id: 'tool', name: 'Bash', args: { command: 'npm test' } } },
    { type: 'tool/result', seq: 19, callId: 'tool', ok: true, output: 'recorded output' },
  ]
  if (state === 'recovered-tool') return [
    { type: 'tool/call', seq: 0, call: { id: 'tool', name: 'Bash', args: { command: 'npm test' } } },
    { type: 'tool/result', seq: 1, callId: 'tool', ok: true, output: 'partial output', recovery: true },
  ]
  if (state === 'artifacts') return [
    { type: 'tool/call', seq: 0, call: { id: 'file', name: 'Read', args: { path: 'C:/fixture/project/README.md' } } },
    { type: 'tool/result', seq: 1, callId: 'file', ok: true, output: '# fixture' },
    { type: 'tool/call', seq: 2, call: { id: 'command', name: 'Bash', args: { command: 'npm test' } } },
    { type: 'tool/result', seq: 3, callId: 'command', ok: false, output: 'test failure' },
    { type: 'tool/call', seq: 4, call: { id: 'output', name: 'custom_tool', args: {} } },
    { type: 'tool/result', seq: 5, callId: 'output', ok: true, output: 'custom output' },
    { type: 'tool/call', seq: 6, call: { id: 'pending', name: 'Read', args: { file_path: 'C:/fixture/project/pending.ts' } } },
    { type: 'tool/call', seq: 7, call: { id: 'recovered', name: 'Read', args: { path: 'C:/fixture/project/recovered.ts' } } },
    { type: 'tool/result', seq: 8, callId: 'recovered', ok: true, output: 'partial recovered output', recovery: true },
  ]
  if (state === 'delegation') return [{ type: 'agent/child-spawn', seq: 0, childSessionId: 'child', definition: 'explorer', objective: 'Map the app' }]
  if (state === 'approval') return [
    ...Array.from({ length: 14 }, (_, index) => ({ type: 'user/message', seq: index, content: `Approval context ${index + 1}\n${'Detailed transcript content '.repeat(12)}` })),
    { type: 'turn/start', seq: 14 },
    { type: 'approval/request', seq: 15, approvalId: 'approval-1', call: { id: 'call-1', name: 'Bash', args: { command: 'npm test', cwd: 'C:/fixture/project' } } },
  ]
  return [{ type: 'user/message', seq: 0, content: 'No work item' }]
}

async function fixture(page: Page, state: FixtureState): Promise<Fixture> {
  const records: RequestRecord[] = []
  let createdConversation = false
  let provider = { id: 'fixture-provider', name: 'Fixture provider', baseUrl: 'http://fixture.invalid', enabled: true, keyMasked: '***', models: ['fixture-model'], defaultModel: 'fixture-model', modelSettings: {} }
  const replacementProvider = { id: 'replacement-provider', name: 'Replacement provider', baseUrl: 'http://replacement.invalid', enabled: true, keyMasked: '', models: ['replacement-model'], defaultModel: 'replacement-model', modelSettings: {} }
  let providerDeleted = false
  let skillPutCount = 0
  let memoryPatchCount = 0
  let agentDeleteCount = 0
  let mcpActionCount = 0
  let secretDeleteCount = 0
  const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status, json: value })

  await page.addInitScript(({ events, reconnect, delayed }) => {
    class FixtureEventSource {
      static readonly CONNECTING = 0
      static readonly OPEN = 1
      static readonly CLOSED = 2
      readonly CONNECTING = 0
      readonly OPEN = 1
      readonly CLOSED = 2
      readyState = FixtureEventSource.CONNECTING
      onopen: ((event: Event) => void) | null = null
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent<string>) => void) | null = null
      constructor(readonly url: string) {
        window.setTimeout(() => {
          this.readyState = FixtureEventSource.OPEN
          this.onopen?.(new Event('open'))
          window.setTimeout(() => this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ kind: 'snapshot', events }) })), delayed ? 120 : 0)
          if (reconnect) window.setTimeout(() => {
            this.readyState = FixtureEventSource.CONNECTING
            this.onerror?.(new Event('error'))
          }, 20)
        }, 0)
      }
      close(): void { this.readyState = FixtureEventSource.CLOSED }
      addEventListener(): void {}
      removeEventListener(): void {}
      dispatchEvent(): boolean { return true }
    }
    Object.defineProperty(window, 'EventSource', { configurable: true, writable: true, value: FixtureEventSource })
  }, { events: fixtureEvents(state), reconnect: state === 'reconnect', delayed: state === 'late-transcript' })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    let body: unknown = null
    try { body = request.postDataJSON() } catch { body = request.postData() }
    records.push({ method, path, body })

    if (path === '/api/workspaces' && method === 'GET') return json(route, state === 'no-workspace' ? [] : [{ id: 'w', name: 'Fixture workspace', default: true, archived: false, createdAt: 0 }])
    if (path === '/api/workspaces/w/projects' && method === 'GET') return json(route, [{ id: 'p', name: 'Fixture project', workspaceId: 'w', path: 'C:/fixture/project', createdAt: 0 }])
    if (path === '/api/workspaces/w/sessions' && method === 'GET') return json(route, state === 'new-conversation' || state === 'new-conversation-success'
      ? (createdConversation ? [{ id: 'created', workspaceId: 'w', title: 'Created conversation', projectId: 'p', folder: null, eventCount: 0, createdAt: 0, updatedAt: 0, status: 'idle' }] : [])
      : [
          { id: 's', workspaceId: 'w', title: 'Fixture conversation', projectId: 'p', folder: null, eventCount: fixtureEvents(state).length, createdAt: 0, updatedAt: 0, status: state === 'running-tool' || state === 'reconnect' || state === 'approval' ? 'running' : 'idle' },
          ...(state === 'delegation' ? [{ id: 'child', workspaceId: 'w', title: 'Child conversation', folder: null, eventCount: 0, createdAt: 0, updatedAt: 0 }] : []),
        ])
    if (path === '/api/workspaces/w/sessions' && method === 'POST') { createdConversation = true; return json(route, { id: 'created', projectId: 'p' }) }
    if (path === '/api/workspaces/w/meta' && method === 'GET') return json(route, {
      workspace: { id: 'w', name: 'Fixture workspace', archived: false },
      provider: 'fixture-provider',
      model: 'fixture-model',
      providers: [...(providerDeleted ? [] : [provider]), replacementProvider],
      models: ['fixture-model'],
      projects: [{ id: 'p', name: 'Fixture project', path: 'C:/fixture/project' }],
      policy: { Bash: 'ask' },
      thinkingLevel: null,
    })
    if (path === '/api/workspaces/w/mode' && method === 'GET') return json(route, { modes: [{ id: 'chat', name: 'Chat', source: 'bundled' }], selected: 'chat', revision: 1 })
    if (path.endsWith('/manifest') && method === 'GET') return json(route, { modeId: 'chat', modeRevision: 1, budget: { availableTokens: 32000, usedTokens: 0, estimated: false }, history: { setting: 'all', includedTurns: 0, omittedTurns: 0 }, sources: { skills: [], memory: [], toolNames: [], toolSchemas: 0 }, omissions: [] })
    if (path === `${SESSION_PATH}/messages` && method === 'POST') return json(route, { inputId: 'queued-1', queued: state === 'running-tool' || state === 'reconnect' })
    if (path === '/api/workspaces/w/sessions/created/messages' && method === 'POST') return state === 'new-conversation-success'
      ? json(route, { inputId: 'accepted-first', queued: false })
      : json(route, { error: 'fixture send refused' }, 503)
    if (path === `${SESSION_PATH}/stop` && method === 'POST') return json(route, { stopped: true })
    if (path === '/api/approvals/approval-1' && method === 'POST') return json(route, { answered: true })
    if (path === '/api/workspaces/w/policy' && method === 'PUT') return json(route, { policy: body })
    if (state === 'settings') {
      if (path === '/api/providers/fixture-provider' && method === 'PATCH') { provider = { ...provider, ...(body as object) }; return json(route, provider) }
      if (path === '/api/providers/fixture-provider' && method === 'DELETE') { providerDeleted = true; return json(route, { deleted: true }) }
      if (path === '/api/providers/fixture-provider/test' && method === 'POST') return json(route, { ok: true })
      if (path === '/api/providers/fixture-provider/sync' && method === 'POST') return json(route, { ok: true, models: ['fixture-model', 'fixture-next'] })
      if (path === '/api/workspaces/w/model' && method === 'PUT') return json(route, { model: (body as { model?: string }).model })
      if (path === '/api/workspaces/w/projects/p' && method === 'DELETE') return json(route, { error: 'project is bound to 1 conversation and has a running session' }, 409)
      if (path === '/api/workspaces/w/skills' && method === 'GET') return json(route, [{ name: 'fixture-skill', title: 'Fixture skill', description: '', source: 'workspace', hash: 'skill-old' }])
      if (path === '/api/workspaces/w/skills/fixture-skill' && method === 'GET') return json(route, { name: 'fixture-skill', title: 'Fixture skill', description: '', source: 'workspace', hash: skillPutCount === 0 ? 'skill-old' : 'skill-fresh', instructions: '---\nname: fixture-skill\n---\n\nserver content' })
      if (path === '/api/workspaces/w/skills/fixture-skill' && method === 'PUT') { skillPutCount += 1; return skillPutCount === 1 ? json(route, { error: 'skill conflict' }, 409) : json(route, { name: 'fixture-skill', hash: 'skill-saved' }) }
      if (path === '/api/workspaces/w/memory' && method === 'GET') return json(route, [{ id: 'fixture-memory', title: 'Fixture memory', pinned: false, createdAt: 0, updatedAt: 0, body: 'server body', hash: memoryPatchCount === 0 ? 'memory-old' : 'memory-fresh' }])
      if (path === '/api/workspaces/w/memory/fixture-memory' && method === 'GET') return json(route, { id: 'fixture-memory', title: 'Fixture memory', pinned: false, createdAt: 0, updatedAt: 0, body: 'server body', hash: memoryPatchCount === 0 ? 'memory-old' : 'memory-fresh' })
      if (path === '/api/workspaces/w/memory/fixture-memory' && method === 'PATCH') { memoryPatchCount += 1; return memoryPatchCount === 1 ? json(route, { error: 'memory conflict' }, 409) : json(route, { id: 'fixture-memory', title: 'Fixture memory', pinned: false, createdAt: 0, updatedAt: 0, body: 'local body', hash: 'memory-saved' }) }
      if (path === '/api/workspaces/w/agents' && method === 'GET') return json(route, agentDeleteCount === 0 ? [{ source: 'workspace', definition: { name: 'fixture-agent', description: 'Fixture agent', tools: [], disallowedTools: [] } }] : [])
      if (path === '/api/workspaces/w/agents/children' && method === 'GET') return json(route, [])
      if (path === '/api/workspaces/w/agents/fixture-agent' && method === 'DELETE') { agentDeleteCount += 1; return agentDeleteCount === 1 ? json(route, { error: 'agent delete refused' }, 503) : json(route, { deleted: true }) }
      if (path === '/api/workspaces/w/mcp' && method === 'GET') return json(route, [{ name: 'fixture-mcp', transport: 'stdio', enabled: false, status: 'disabled', breakerOpenUntil: null }])
      if (path === '/api/workspaces/w/mcp/fixture-mcp/enable' && method === 'POST') { mcpActionCount += 1; return mcpActionCount === 1 ? json(route, { error: 'MCP enable refused' }, 503) : json(route, { status: 'ready' }) }
      if (path === '/api/workspaces/w/hooks' && method === 'GET') return json(route, { version: 1, hooks: { PreToolUse: [{ matcher: 'Bash*', type: 'command', command: 'node guard.mjs', onFailure: 'deny' }] } })
      if (path === '/api/workspaces/w/hooks' && method === 'PUT') return json(route, { saved: true })
      if (path === '/api/workspaces/w/secrets' && method === 'GET') return json(route, secretDeleteCount < 2 ? [{ name: 'FIXTURE_SECRET' }] : [])
      if (path === '/api/workspaces/w/secrets/FIXTURE_SECRET' && method === 'DELETE') { secretDeleteCount += 1; return secretDeleteCount === 1 ? json(route, { error: 'secret delete refused' }, 503) : json(route, { deleted: 'FIXTURE_SECRET' }) }
    }
    throw new Error(`Unexpected fixture API request: ${method} ${url.href}`)
  })

  await page.addInitScript(() => {
    if (window.sessionStorage.getItem('fixture-storage-initialized') === null) {
      window.localStorage.clear()
      window.sessionStorage.setItem('fixture-storage-initialized', 'true')
    }
  })
  await page.goto(state === 'no-workspace' ? '/' : state === 'new-conversation' || state === 'new-conversation-success' ? '/workspaces/w' : '/workspaces/w/sessions/s')
  await expect(page.getByRole('button', { name: 'Open settings', exact: true })).toBeVisible()
  await expect(page.locator('.composer-input')).toBeVisible()
  if (state !== 'no-workspace' && state !== 'new-conversation' && state !== 'new-conversation-success') {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    const openNavigation = page.getByRole('button', { name: 'Open conversation navigation' })
    if (await openNavigation.count() > 0) await openNavigation.click()
    await expect(page.getByRole('button', { name: /Fixture conversation/ })).toBeVisible()
    await expect(page.locator('.session-item-shell.active')).toHaveCount(1)
    await expect(page.locator('.transcript')).toBeVisible()
    const drawer = page.getByRole('dialog', { name: 'Conversation navigation' })
    if (await drawer.count() > 0) await page.keyboard.press('Escape')
  }
  return {
    requests: () => records,
    count: (method, path) => records.filter((request) => request.method === method && request.path === path).length,
  }
}

function expectNoMutationRequests(state: Fixture, before: number): void {
  expect(state.requests().filter((request) => request.method !== 'GET')).toHaveLength(before)
}

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`settings keeps all eight sections reachable with keyboard navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    const state = await fixture(page, 'settings')
    const trigger = page.getByRole('button', { name: 'Open settings', exact: true })
    await trigger.focus()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(dialog).toBeVisible()
    const labels = ['Providers', 'Projects', 'Skills', 'Memory', 'Agents', 'MCP', 'Hooks', 'Secrets']
    if (width <= 600) {
      const section = page.getByRole('combobox', { name: 'Settings section' })
      await expect(section).toBeVisible()
      for (const label of labels) {
        await section.click()
        await page.getByRole('option', { name: label, exact: true }).click()
        await expect(dialog.getByRole('heading', { name: label, exact: true }).first()).toBeVisible()
      }
    } else {
      const providers = dialog.getByRole('tab', { name: /Providers/ })
      await providers.focus()
      await page.keyboard.press('ArrowDown')
      await expect(dialog.getByRole('tab', { name: /Projects/ })).toBeFocused()
      for (const label of labels) {
        const tab = dialog.getByRole('tab', { name: new RegExp(label) })
        await tab.click()
        await expect(tab).toHaveAttribute('aria-selected', 'true')
        await expect(dialog.getByRole('heading', { name: label, exact: true }).first()).toBeVisible()
      }
    }
    if (width <= 600) {
      const section = page.getByRole('combobox', { name: 'Settings section' })
      await section.click()
      await page.getByRole('option', { name: 'Hooks', exact: true }).click()
    } else await dialog.getByRole('tab', { name: /Hooks/ }).click()
    const panel = dialog.locator('.settings-tab-panel')
    await expect(panel).toHaveCSS('overflow-y', 'auto')
    await expect.poll(() => panel.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0)
    await panel.evaluate(element => { element.scrollTop = element.scrollHeight })
    await expect.poll(() => panel.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    const lastSection = panel.locator('.manage-section').last()
    if (await lastSection.count() > 0) {
      await lastSection.scrollIntoViewIfNeeded()
      const [panelBox, sectionBox] = await Promise.all([panel.boundingBox(), lastSection.boundingBox()])
      expect(panelBox).not.toBeNull(); expect(sectionBox).not.toBeNull()
      expect(sectionBox!.y + sectionBox!.height).toBeLessThanOrEqual(panelBox!.y + panelBox!.height + 2)
    }
    await dialog.getByRole('button', { name: 'Close settings' }).click()
    await expect(trigger).toBeFocused()
    expect(state.requests().every(request => request.path.startsWith('/api/'))).toBe(true)
  })
}

for (const width of [375, 1024]) {
  test(`provider discard confirmation uses ${width <= 600 ? 'mobile Select' : 'desktop tabs'} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await fixture(page, 'settings')
    await page.getByRole('button', { name: 'Open settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByLabel('Name').fill('Dirty provider')
    if (width <= 600) {
      await page.getByRole('combobox', { name: 'Settings section' }).click()
      await page.getByRole('option', { name: 'Projects', exact: true }).click()
    } else await dialog.getByRole('tab', { name: /Projects/ }).click()
    await expect(page.getByRole('dialog', { name: 'Discard unsaved provider changes?' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog.getByLabel('Name')).toHaveValue('Dirty provider')
  })
}

test('provider replacement, close, and pending model text all require discard confirmation', async ({ page }) => {
  await fixture(page, 'settings')
  const trigger = page.getByRole('button', { name: 'Open settings', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByLabel('Name').fill('dirty')
  await dialog.getByRole('button', { name: /Replacement provider/ }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved provider changes?' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await dialog.getByRole('button', { name: 'Close settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved provider changes?' })).toBeVisible()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(trigger).toBeFocused()

  await trigger.click()
  const reopened = page.getByRole('dialog', { name: 'Settings' })
  await reopened.getByPlaceholder('gpt-5.6-sol, gpt-5.6-terra').fill('pending-model')
  await reopened.getByRole('button', { name: /Replacement provider/ }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved provider changes?' })).toBeVisible()
})

test('provider dirty draft survives sections, confirms discard, and omits a blank stored key', async ({ page }) => {
  const state = await fixture(page, 'settings')
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  const name = dialog.getByLabel('Name')
  await name.fill('Fixture provider edited')
  await dialog.getByRole('tab', { name: /Skills/ }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved provider changes?' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(name).toHaveValue('Fixture provider edited')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(() => state.count('PATCH', '/api/providers/fixture-provider')).toBe(1)
  const patch = state.requests().find(request => request.method === 'PATCH' && request.path === '/api/providers/fixture-provider')?.body as Record<string, unknown>
  expect(patch.apiKey).toBeUndefined()
  expect(patch.name).toBe('Fixture provider edited')
})

test('provider test, sync, activate, and delete use exact existing requests', async ({ page }) => {
  const state = await fixture(page, 'settings')
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('button', { name: 'Test connection' }).click()
  await dialog.getByRole('button', { name: 'Sync from /models' }).click()
  await expect(dialog.getByText('fixture-next')).toBeVisible()
  await dialog.getByRole('button', { name: 'Use in workspace' }).first().click()
  await dialog.getByRole('button', { name: 'Delete provider' }).click()
  await dialog.getByRole('button', { name: 'Delete permanently' }).click()
  await expect.poll(() => state.count('DELETE', '/api/providers/fixture-provider')).toBe(1)
  for (const expected of [
    ['POST', '/api/providers/fixture-provider/test'],
    ['POST', '/api/providers/fixture-provider/sync'],
    ['PUT', '/api/workspaces/w/model'],
    ['DELETE', '/api/providers/fixture-provider'],
  ] as const) expect(state.count(expected[0], expected[1])).toBe(1)
  expect(state.requests().find(request => request.path === '/api/workspaces/w/model')?.body).toEqual({ provider: 'fixture-provider', model: 'fixture-model' })
  expect(state.requests().filter(request => ['/api/providers/fixture-provider/test', '/api/providers/fixture-provider/sync', '/api/providers/fixture-provider'].includes(request.path) && request.method !== 'PATCH').every(request => request.body === null)).toBe(true)
})

test('project bound and running 409 remains visible after confirmed removal', async ({ page }) => {
  const state = await fixture(page, 'settings')
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('tab', { name: /Projects/ }).click()
  await dialog.getByRole('button', { name: 'Remove project' }).click()
  await dialog.getByRole('button', { name: 'Remove registration' }).click()
  await expect(dialog).toContainText('project is bound to 1 conversation and has a running session')
  expect(state.count('DELETE', '/api/workspaces/w/projects/p')).toBe(1)
})

test('Hooks raw invalid stays intact and valid raw saves the exact whole document', async ({ page }) => {
  const state = await fixture(page, 'settings')
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('tab', { name: /Hooks/ }).click()
  await dialog.getByRole('button', { name: 'Advanced · edit raw JSON' }).click()
  const raw = dialog.getByLabel('hooks.json')
  await raw.fill('{}')
  await dialog.getByRole('button', { name: 'Apply raw' }).click()
  await expect(dialog).toContainText('Hooks validation error: version must be 1')
  await expect(raw).toHaveValue('{}')
  expect(state.count('PUT', '/api/workspaces/w/hooks')).toBe(0)
  const document = { version: 1, hooks: { PreToolUse: [{ matcher: 'Bash*', type: 'command', command: 'node exact.mjs', args: ['--safe'], timeoutMs: 800, onFailure: 'deny' }] } }
  await raw.fill(JSON.stringify(document))
  await dialog.getByRole('button', { name: 'Apply raw' }).click()
  await dialog.getByRole('button', { name: 'Save hooks' }).click()
  await expect.poll(() => state.count('PUT', '/api/workspaces/w/hooks')).toBe(1)
  expect(state.requests().find(request => request.method === 'PUT' && request.path === '/api/workspaces/w/hooks')?.body).toEqual(document)
})

for (const invalid of [
  { label: 'unknown top-level key', draft: '{\n  "version": 1,\n  "hooks": {},\n  "extra": true\n}', error: 'unknown top-level key "extra"' },
  { label: 'unknown binding key', draft: '{"version":1,"hooks":{"PreToolUse":[{"matcher":"*","type":"command","command":"node guard.mjs","onFailure":"deny","extra":true}]}}', error: 'PreToolUse[0] has unknown key "extra"' },
]) {
  test(`Hooks raw ${invalid.label} remains verbatim/open with zero PUT`, async ({ page }) => {
    const state = await fixture(page, 'settings')
    await page.getByRole('button', { name: 'Open settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('tab', { name: /Hooks/ }).click()
    await dialog.getByRole('button', { name: 'Advanced · edit raw JSON' }).click()
    const raw = dialog.getByLabel('hooks.json')
    await raw.fill(invalid.draft)
    await dialog.getByRole('button', { name: 'Apply raw' }).click()
    await expect(dialog).toContainText(invalid.error)
    await expect(raw).toHaveValue(invalid.draft)
    await expect(dialog.getByRole('button', { name: 'Apply raw' })).toBeVisible()
    expect(state.count('PUT', '/api/workspaces/w/hooks')).toBe(0)
  })
}

test('Agents, MCP, and Secrets expose destructive failures and explicit recovery requests', async ({ page }) => {
  const state = await fixture(page, 'settings')
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('tab', { name: /Agents/ }).click()
  await dialog.getByRole('button', { name: /fixture-agent/ }).click()
  await dialog.getByRole('button', { name: 'Delete selected agent' }).click()
  await dialog.getByRole('button', { name: 'Delete definition' }).click()
  await expect(dialog).toContainText('agent delete refused')
  expect(state.count('DELETE', '/api/workspaces/w/agents/fixture-agent')).toBe(1)
  await dialog.getByRole('button', { name: 'Delete definition' }).click()
  await expect.poll(() => state.count('DELETE', '/api/workspaces/w/agents/fixture-agent')).toBe(2)

  await dialog.getByRole('tab', { name: /MCP/ }).click()
  await dialog.getByRole('button', { name: 'Enable' }).click()
  await expect(dialog).toContainText('MCP enable refused')
  await dialog.getByRole('button', { name: 'Enable' }).click()
  await expect.poll(() => state.count('POST', '/api/workspaces/w/mcp/fixture-mcp/enable')).toBe(2)

  await dialog.getByRole('tab', { name: /Secrets/ }).click()
  await dialog.getByRole('button', { name: 'Delete FIXTURE_SECRET' }).click()
  await dialog.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(dialog).toContainText('secret delete refused')
  await dialog.getByRole('button', { name: 'Delete permanently' }).click()
  await expect.poll(() => state.count('DELETE', '/api/workspaces/w/secrets/FIXTURE_SECRET')).toBe(2)
  expect(state.requests().filter(request => request.method === 'DELETE' && /agents|secrets/.test(request.path)).every(request => request.body === null)).toBe(true)
})

test('Skills and Memory 409 conflicts require explicit reload or overwrite', async ({ page }) => {
  const state = await fixture(page, 'settings')
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('tab', { name: /Skills/ }).click()
  await dialog.getByRole('button', { name: 'Edit' }).click()
  await dialog.getByLabel('SKILL.md content').fill('local skill body')
  await dialog.getByRole('button', { name: 'Save skill' }).click()
  await expect(dialog.getByRole('button', { name: 'Reload server version' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Overwrite anyway' })).toBeVisible()
  expect(state.count('PUT', '/api/workspaces/w/skills/fixture-skill')).toBe(1)
  await dialog.getByRole('button', { name: 'Overwrite anyway' }).click()
  await expect.poll(() => state.count('PUT', '/api/workspaces/w/skills/fixture-skill')).toBe(2)

  await dialog.getByRole('tab', { name: /Memory/ }).click()
  await dialog.getByRole('button', { name: /Fixture memory/ }).click()
  await dialog.getByLabel('Body').fill('local body')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Reload server version' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Overwrite anyway' })).toBeVisible()
  expect(state.count('PATCH', '/api/workspaces/w/memory/fixture-memory')).toBe(1)
})

test('workbench shows the active running tool while its transcript row remains durable', async ({ page }) => {
  const state = await fixture(page, 'running-tool')
  const before = state.requests().filter((request) => request.method !== 'GET').length
  const surface = page.locator('[data-workbench-surface]')
  await expect(surface).toContainText('Bash')
  await expect(surface).toContainText('Running')
  await expect(surface).not.toContainText('Output')
  await expect(page.locator('.transcript .tool-row')).toHaveCount(1)
  expectNoMutationRequests(state, before)
})

test('workbench shows completed recorded output while the transcript row remains without requests', async ({ page }) => {
  const state = await fixture(page, 'completed-tool')
  const before = state.requests().filter((request) => request.method !== 'GET').length
  const output = page.locator('[data-workbench-surface] details').last()
  await output.locator('summary').click()
  await output.locator('summary').click()
  await expect(output.locator('pre')).toContainText('recorded output')
  await expect(page.locator('.transcript .tool-row')).toHaveCount(1)
  expectNoMutationRequests(state, before)
})

test('recovered workbench outcome is unknown and never successful without requests', async ({ page }) => {
  const state = await fixture(page, 'recovered-tool')
  const before = state.requests().filter((request) => request.method !== 'GET').length
  const surface = page.locator('[data-workbench-surface]')
  await expect(surface).toContainText('Outcome unknown — the host restarted before this result was recorded.')
  await expect(surface).not.toContainText('Completed')
  await surface.locator('details').last().locator('summary').evaluate((element: HTMLElement) => element.click())
  expectNoMutationRequests(state, before)
})

test('delegation workbench opens its existing child conversation route', async ({ page }) => {
  await fixture(page, 'delegation')
  await page.locator('[data-workbench-surface]').getByRole('button', { name: 'Open conversation' }).click()
  await expect(page).toHaveURL('/workspaces/w/sessions/child')
})

test('no tool or delegation does not render an empty workbench surface', async ({ page }) => {
  const state = await fixture(page, 'no-work')
  const before = state.requests().filter((request) => request.method !== 'GET').length
  await expect(page.locator('[data-workbench-surface]')).toHaveCount(0)
  expectNoMutationRequests(state, before)
})

test('Artifacts projects existing event data without any additional API request', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const state = await fixture(page, 'artifacts')
  await expect.poll(() => state.count('GET', `${SESSION_PATH}/manifest`)).toBe(1)
  const before = state.requests().length
  await page.getByRole('tab', { name: 'Artifacts' }).click()
  const list = page.getByRole('list', { name: 'Recorded artifacts' })
  await expect(list).toContainText('File reference')
  await expect(list).toContainText('C:/fixture/project/README.md')
  await expect(list).toContainText('Command record')
  await expect(list).toContainText('npm test')
  await expect(list).toContainText('failed')
  await expect(list).toContainText('custom output')
  await expect(list).toContainText('pending')
  await expect(list).toContainText('Outcome unknown — the host restarted before this result was recorded.')
  await expect(list).not.toContainText(/file content|diff|changed files|terminal/i)
  await page.waitForTimeout(750)
  expect(state.requests()).toHaveLength(before)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute('aria-selected', 'true')
  await page.waitForTimeout(750)
  expect(state.count('GET', `${SESSION_PATH}/manifest`)).toBe(1)
})

test('Context manifest is lazy for the exact tab, selection, settled, and open conditions', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  const state = await fixture(page, 'no-work')
  expect(state.count('GET', `${SESSION_PATH}/manifest`)).toBe(0)
  const opener = page.getByRole('button', { name: 'Open context inspector' })
  await opener.click()
  await expect.poll(() => state.count('GET', `${SESSION_PATH}/manifest`)).toBe(1)
  await page.getByRole('tab', { name: 'Artifacts' }).click()
  const afterContext = state.requests().length
  await page.waitForTimeout(750)
  expect(state.requests()).toHaveLength(afterContext)
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Context' })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => state.count('GET', `${SESSION_PATH}/manifest`)).toBe(2)
})

test('manifest stays fail-closed beyond the delay when the active workspace is null', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const state = await fixture(page, 'no-workspace')
  await page.waitForTimeout(750)
  expect(state.requests().filter(request => request.path.endsWith('/manifest'))).toHaveLength(0)
})

test('manifest stays fail-closed beyond the delay when the current conversation is null', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const state = await fixture(page, 'new-conversation-success')
  await page.waitForTimeout(750)
  expect(state.requests().filter(request => request.path.endsWith('/manifest'))).toHaveLength(0)
})

test('manifest stays fail-closed beyond the delay while the session is running', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const state = await fixture(page, 'running-tool')
  await page.waitForTimeout(750)
  expect(state.count('GET', `${SESSION_PATH}/manifest`)).toBe(0)
})

for (const width of [320, 375, 768, 1024]) {
  test(`right panel tabs retain keyboard navigation and drawer focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    const state = await fixture(page, 'artifacts')
    if (width < 1280) await page.getByRole('button', { name: 'Open context inspector' }).click()
    const dialog = page.getByRole('dialog', { name: 'Context inspector' })
    await expect(dialog).toBeVisible()
    const context = page.getByRole('tab', { name: 'Context' })
    await context.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Artifacts' })).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute('aria-selected', 'true')
    const before = state.requests().length
    await page.waitForTimeout(750)
    expect(state.requests()).toHaveLength(before)
    await page.keyboard.press('Tab')
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute('aria-label'))).toBe('Context inspector')
  })
}

for (const width of REQUIRED_WIDTHS) {
  test(`composer and approval dock remain usable in the center region at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    const state = await fixture(page, 'approval')
    const dock = page.locator('[data-conversation-dock]')
    const center = page.locator('[data-workbench-shell] > div:nth-child(2) > main')
    await expect(dock).toBeVisible()
    const [box, centerBox] = await Promise.all([dock.boundingBox(), center.boundingBox()])
    expect(box).not.toBeNull()
    expect(centerBox).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(centerBox!.x - 1)
    expect(box!.x + box!.width).toBeLessThanOrEqual(centerBox!.x + centerBox!.width + 1)
    expect(box!.y + box!.height).toBeLessThanOrEqual(800)
    await expect(page.locator('.composer-input')).toBeVisible()
    await expect(page.locator('.composer-send')).toBeVisible()

    const surface = page.locator('.conversation-dock-surface')
    const approval = page.locator('.approval-review')
    const allowOnce = page.getByRole('button', { name: 'Allow once' })
    await allowOnce.scrollIntoViewIfNeeded()
    const [approvalBox, actionBox, composerBox, surfaceBox] = await Promise.all([
      approval.boundingBox(),
      allowOnce.boundingBox(),
      page.locator('.composer').boundingBox(),
      surface.boundingBox(),
    ])
    expect(approvalBox).not.toBeNull()
    expect(actionBox).not.toBeNull()
    expect(composerBox).not.toBeNull()
    expect(surfaceBox).not.toBeNull()
    expect(actionBox!.y).toBeGreaterThanOrEqual(Math.max(0, surfaceBox!.y) - 1)
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(Math.min(800, surfaceBox!.y + surfaceBox!.height) + 1)
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(composerBox!.y + 1)
    expect(approvalBox!.y + approvalBox!.height).toBeLessThanOrEqual(composerBox!.y + 1)

    const scroll = page.locator('.chat-scroll')
    const lastItem = page.locator('.transcript > :not(.transcript-tail)').last()
    await lastItem.scrollIntoViewIfNeeded()
    await scroll.evaluate((element) => {
      const rows = element.querySelectorAll<HTMLElement>('.transcript > :not(.transcript-tail)')
      const last = rows.item(rows.length - 1)
      const dock = document.querySelector<HTMLElement>('[data-conversation-dock]')
      if (last === null || dock === null) return
      element.scrollTop += last.getBoundingClientRect().bottom - dock.getBoundingClientRect().top
    })
    const lastBox = await lastItem.boundingBox()
    expect(lastBox).not.toBeNull()
    expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(box!.y + 2)

    await allowOnce.dblclick({ delay: 5 })
    await expect.poll(() => state.count('POST', '/api/approvals/approval-1')).toBe(1)
  })
}

test('late SSE transcript mounts with final row clearing the stable dock', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 800 })
  await fixture(page, 'late-transcript')
  const dock = page.locator('[data-conversation-dock]')
  const last = page.locator('.transcript > :not(.transcript-tail)').last()
  await expect(last).toContainText('Late transcript item 12')
  await last.scrollIntoViewIfNeeded()
  await page.locator('.chat-scroll').evaluate((element) => {
    const row = element.querySelectorAll<HTMLElement>('.transcript > :not(.transcript-tail)').item(element.querySelectorAll('.transcript > :not(.transcript-tail)').length - 1)
    const dock = document.querySelector<HTMLElement>('[data-conversation-dock]')
    if (row !== null && dock !== null) element.scrollTop += row.getBoundingClientRect().bottom - dock.getBoundingClientRect().top
  })
  const [dockBox, lastBox] = await Promise.all([dock.boundingBox(), last.boundingBox()])
  expect(dockBox).not.toBeNull()
  expect(lastBox).not.toBeNull()
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(dockBox!.y + 2)
})

test('running Enter queues once and Stop uses the existing endpoints', async ({ page }) => {
  const state = await fixture(page, 'running-tool')
  const input = page.locator('.composer-input')
  await input.fill('queue this follow-up')
  await input.press('Enter')
  await expect.poll(() => state.count('POST', `${SESSION_PATH}/messages`)).toBe(1)
  expect(state.requests().find((request) => request.method === 'POST' && request.path === `${SESSION_PATH}/messages`)?.body).toMatchObject({ content: 'queue this follow-up' })
  await page.getByRole('button', { name: 'Stop work' }).click()
  await expect.poll(() => state.count('POST', `${SESSION_PATH}/stop`)).toBe(1)
})

test('reconnect retains running state, editable draft, queue and stop controls across durable reload', async ({ page }) => {
  const state = await fixture(page, 'reconnect')
  const input = page.locator('.composer-input')
  await input.fill('draft retained during reconnect')
  await expect(page.locator('.task-status')).toContainText('Working')
  await expect(page.locator('.task-status')).toContainText('does not mean work has stopped')
  await expect(page.locator('[data-workbench-surface]')).toContainText('Running')
  await expect(page.locator('[data-workbench-surface]')).not.toContainText(/Completed|Failed/)
  await expect(input).toHaveValue('draft retained during reconnect')
  await expect(input).toBeEditable()
  await expect(page.getByRole('button', { name: 'Stop work' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Queue message' })).toBeVisible()
  expect(state.count('POST', `${SESSION_PATH}/messages`)).toBe(0)
  expect(state.count('POST', `${SESSION_PATH}/stop`)).toBe(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Open settings', exact: true })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.task-status')).toContainText('Working')
  await expect(page.locator('[data-workbench-surface]')).toContainText('Running')
  await expect(page.locator('[data-workbench-surface]')).not.toContainText(/Completed|Failed/)
  await expect(page.getByRole('button', { name: 'Stop work' })).toBeVisible()
  expect(state.count('POST', `${SESSION_PATH}/messages`)).toBe(0)
  expect(state.count('POST', `${SESSION_PATH}/stop`)).toBe(0)
})

test('immediate successful first send atomically migrates and clears the target draft', async ({ page }) => {
  const state = await fixture(page, 'new-conversation-success')
  const input = page.locator('.composer-input')
  const content = 'fast accepted first draft'
  await input.fill(content)
  await input.press('Enter')
  await expect(page).toHaveURL('/workspaces/w/sessions/created')
  await expect(input).toHaveValue('')
  await expect.poll(() => state.count('POST', '/api/workspaces/w/sessions')).toBe(1)
  await expect.poll(() => state.count('POST', '/api/workspaces/w/sessions/created/messages')).toBe(1)
  const sent = state.requests().find((request) => request.method === 'POST' && request.path === '/api/workspaces/w/sessions/created/messages')
  expect(sent?.body).toMatchObject({ content })
  expect((sent?.body as { clientRequestId?: unknown })?.clientRequestId).toEqual(expect.any(String))
})

test('first-send failure keeps the draft in the created conversation and sends once', async ({ page }) => {
  const state = await fixture(page, 'new-conversation')
  const input = page.locator('.composer-input')
  await input.fill('preserve this first draft')
  await input.press('Enter')
  await expect(page).toHaveURL('/workspaces/w/sessions/created')
  await expect(page.getByRole('alert')).toContainText('Your draft has been kept')
  await expect(input).toHaveValue('preserve this first draft')
  await expect.poll(() => state.count('POST', '/api/workspaces/w/sessions')).toBe(1)
  await expect.poll(() => state.count('POST', '/api/workspaces/w/sessions/created/messages')).toBe(1)
})

test('nested Escape closes the composer popover before the open drawer', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 800 })
  await fixture(page, 'no-work')
  await page.getByRole('button', { name: 'Open conversation navigation' }).click()
  const drawer = page.getByRole('dialog', { name: 'Conversation navigation' })
  await expect(drawer).toBeVisible()
  const trigger = page.locator('.composer-policy-trigger')
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const policy = page.getByRole('dialog', { name: /Workspace controls and permissions/ })
  await expect(policy).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(policy).toHaveCount(0)
  await expect(drawer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
})

async function expectAxeClean(page: Page, include?: string): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags([...AXE_TAGS])
  if (include !== undefined) builder = builder.include(include)
  const result = await builder.analyze()
  expect(result.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) }))).toEqual([])
}

test('axe gates shell, drawers, Context, Artifacts, approval, and every settings section', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await fixture(page, 'approval')
  await expectAxeClean(page)
  await expectAxeClean(page, '.approval-review')
  await expectAxeClean(page, '.env-panel')
  await page.getByRole('tab', { name: 'Artifacts' }).click()
  await expectAxeClean(page, '.env-panel')

  await page.setViewportSize({ width: 768, height: 900 })
  await page.getByRole('button', { name: 'Open conversation navigation' }).click()
  await expectAxeClean(page, '[role="dialog"][aria-label="Conversation navigation"]')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open context inspector' }).click()
  await expectAxeClean(page, '[role="dialog"][aria-label="Context inspector"]')
  await page.keyboard.press('Escape')

  const settingsContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const settingsPage = await settingsContext.newPage()
  await fixture(settingsPage, 'settings')
  await settingsPage.getByRole('button', { name: 'Open settings', exact: true }).click()
  const dialog = settingsPage.getByRole('dialog', { name: 'Settings' })
  for (const label of ['Providers', 'Projects', 'Skills', 'Memory', 'Agents', 'MCP', 'Hooks', 'Secrets']) {
    await dialog.getByRole('tab', { name: new RegExp(label) }).click()
    await expectAxeClean(settingsPage, '.settings-modal')
  }
  await settingsContext.close()
})

test('reduced motion collapses nonessential motion while running status remains visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await fixture(page, 'running-tool')
  const samples = page.locator('.spinner, .tool-spin i, .session-status-dot, .chevron, button').filter({ visible: true })
  await expect.poll(async () => samples.count()).toBeGreaterThan(0)
  for (const sample of await samples.all()) {
    const timing = await sample.evaluate(element => {
      const style = getComputedStyle(element)
      return { animation: style.animationDuration, transition: style.transitionDuration }
    })
    const durations = (value: string): number[] => value.split(',').map(part => part.trim()).filter(Boolean).map(part => part.endsWith('ms') ? Number.parseFloat(part) / 1000 : Number.parseFloat(part))
    expect([...durations(timing.animation), ...durations(timing.transition)].every(value => value <= 0.02)).toBe(true)
  }
  await expect(page.locator('.task-status')).toContainText('Working')
  await expect(page.locator('[data-workbench-surface]')).toContainText('Running')
  await expect(page.getByRole('button', { name: 'Stop work' })).toBeVisible()
})

test('coarse pointer targets meet the minimum on shell, drawers, inspector, approval, and settings', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await fixture(page, 'approval')
  for (const selector of ['.topbar button', '.composer button', '.approval button']) {
    for (const control of await page.locator(selector).filter({ visible: true }).all()) {
      const box = await control.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    }
  }
  await page.getByRole('button', { name: 'Open context inspector' }).click()
  for (const control of await page.getByRole('dialog', { name: 'Context inspector' }).locator('button').filter({ visible: true }).all()) {
    const box = await control.boundingBox(); expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  for (const control of await page.getByRole('dialog', { name: 'Settings' }).locator('button, [role="combobox"]').filter({ visible: true }).all()) {
    const box = await control.boundingBox(); expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  await context.close()
})

test('captures the deterministic Warm Studio screenshot matrix', async ({ browser }) => {
  test.setTimeout(180_000)
  mkdirSync(screenshotRoot, { recursive: true })
  const states: readonly { readonly name: string; readonly fixture: FixtureState; readonly prepare?: (page: Page) => Promise<void> }[] = [
    { name: 'empty-new-conversation', fixture: 'new-conversation-success' },
    { name: 'populated-transcript-workbench', fixture: 'completed-tool' },
    { name: 'running-reconnect-queued-follow-up', fixture: 'reconnect', prepare: async page => { await page.locator('.composer-input').fill('Queued follow-up draft') } },
    { name: 'pending-approval', fixture: 'approval' },
    { name: 'context-tab', fixture: 'no-work', prepare: async page => { if (await page.getByRole('button', { name: 'Open context inspector' }).count() > 0) await page.getByRole('button', { name: 'Open context inspector' }).click(); await expect(page.getByRole('tab', { name: 'Context' })).toBeVisible() } },
    { name: 'artifacts-empty', fixture: 'no-work', prepare: async page => { if (await page.getByRole('button', { name: 'Open context inspector' }).count() > 0) await page.getByRole('button', { name: 'Open context inspector' }).click(); await page.getByRole('tab', { name: 'Artifacts' }).click() } },
    { name: 'artifacts-populated', fixture: 'artifacts', prepare: async page => { if (await page.getByRole('button', { name: 'Open context inspector' }).count() > 0) await page.getByRole('button', { name: 'Open context inspector' }).click(); await page.getByRole('tab', { name: 'Artifacts' }).click() } },
    { name: 'settings-dirty', fixture: 'settings', prepare: async page => { await page.getByRole('button', { name: 'Open settings', exact: true }).click(); await page.getByRole('dialog', { name: 'Settings' }).getByLabel('Name').fill('Dirty provider draft') } },
    { name: 'settings-conflict', fixture: 'settings', prepare: async page => { const dialog = page.getByRole('dialog', { name: 'Settings' }); await page.getByRole('button', { name: 'Open settings', exact: true }).click(); if (await dialog.getByRole('tab', { name: /Skills/ }).count() > 0) await dialog.getByRole('tab', { name: /Skills/ }).click(); else { await page.getByRole('combobox', { name: 'Settings section' }).click(); await page.getByRole('option', { name: 'Skills' }).click() } await dialog.getByRole('button', { name: 'Edit' }).click(); await dialog.getByLabel('SKILL.md content').fill('local conflict draft'); await dialog.getByRole('button', { name: 'Save skill' }).click(); await expect(dialog.getByRole('button', { name: 'Overwrite anyway' })).toBeVisible() } },
  ]
  for (const width of REQUIRED_WIDTHS) {
    for (const state of states) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
      const page = await context.newPage()
      await fixture(page, state.fixture)
      await state.prepare?.(page)
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' })
      await page.screenshot({ path: `${screenshotRoot}/${width}-${state.name}.png`, fullPage: false, animations: 'disabled' })
      await context.close()
    }
  }
})
