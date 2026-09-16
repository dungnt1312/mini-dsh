/// <reference lib="dom" />
import { test, expect, type Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const out = fileURLToPath(new URL('../../artifacts/product-ui/screenshots', import.meta.url))
const ts = 1789120800000 // deterministic fixture timestamp, never production data
const provider = { id: 'p1', name: 'Local provider', baseUrl: 'http://localhost:8080/v1', enabled: true, keyMasked: '••••', models: ['model-one', 'model-two'], defaultModel: 'model-one' }
type FixtureRequest = { method: string; path: string; body: Record<string, unknown> }
type FixtureRequests = FixtureRequest[] & { releaseCreation: () => void }
async function fixture(page: Page, options: { empty?: boolean; approval?: boolean; startAtRoot?: boolean; initialPath?: string; delayCreation?: boolean; failFirstSend?: boolean } = {}): Promise<FixtureRequests> {
  let releaseCreation = (): void => {}
  const creationReady = new Promise<void>((resolve) => { releaseCreation = resolve })
  const requests = Object.assign([] as FixtureRequest[], { releaseCreation })
  const projects: { id: string; workspaceId: string; name: string; path: string; createdAt: number }[] = options.empty ? [] : [{ id: 'p', workspaceId: 'w', name: 'Dự án nguyên bản', path: 'C:/workspace/mini-dsh', createdAt: ts }]
  const sessions: { id: string; workspaceId: string; title: string; projectId?: string; folder: null; eventCount: number; createdAt: number; updatedAt: number }[] = options.empty ? [] : [{ id: 's', workspaceId: 'w', title: 'Review workspace isolation', projectId: 'p', folder: null, eventCount: 8, createdAt: ts, updatedAt: ts }]
  await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname; const method = req.method()
    let body: Record<string, unknown> = {}
    try {
      const parsed: unknown = req.postDataJSON()
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
    } catch { /* request has no JSON body */ }
    requests.push({ method, path, body })
    const json = (value: unknown) => route.fulfill({ json: value })
    if (path.endsWith('/events')) {
      const requestedSessionId = path.split('/').at(-2)
      const requestedWorkspaceId = path.split('/').at(-4)
      const session = sessions.find((candidate) => candidate.id === requestedSessionId && candidate.workspaceId === requestedWorkspaceId)
      if (session === undefined) return route.fulfill({ status: 404, body: 'unknown fixture session' })
      const events = options.empty ? [] : [
        { type: 'turn/start', seq: 0, timestamp: ts },
        { type: 'user/message', seq: 1, timestamp: ts, content: 'Giữ nguyên nội dung của tôi. Review project scope.' },
        { type: 'assistant/chunk', seq: 2, timestamp: ts, delta: 'Inspect the immutable ownership boundary.', thinking: true },
        { type: 'assistant/message', seq: 3, timestamp: ts, content: '## Project scope stays fixed\n\nSwitching workspaces changes navigation, not the running turn.\n\nI checked the creation path and tool boundary.' },
        { type: 'tool/call', seq: 4, timestamp: ts, call: { id: 'call', name: 'read_file', args: { path: 'C:/workspace/mini-dsh/src/harness/agent/scope.ts', exact: 'Dữ liệu gốc' } } },
        { type: 'tool/result', seq: 5, timestamp: ts + 127, callId: 'call', ok: true, output: 'Raw output preserved: dữ liệu gốc\n' + 'long-line '.repeat(80) },
        ...(!options.approval ? [{ type: 'turn/end', seq: 6, timestamp: ts + 200, reason: 'completed' }] : []),
      ]
      let stream = `data: ${JSON.stringify({ kind: 'snapshot', events })}\n\n`
      if (options.approval) stream += `data: ${JSON.stringify({ kind: 'approval', approvalId: 'a', call: { id: 'approval-call', name: 'bash', args: { command: 'npm test -- scope' } } })}\n\n`
      return route.fulfill({ contentType: 'text/event-stream', body: stream })
    }
    if (path === '/api/workspaces') return json([{ id: 'w', name: 'Research workspace', default: true, createdAt: ts }, { id: 'w2', name: 'Không dịch workspace', createdAt: ts }])
    if (path.endsWith('/projects')) {
      if (method === 'POST') {
        const name = typeof body.name === 'string' ? body.name : ''
        const projectPath = typeof body.path === 'string' ? body.path : ''
        const p = { id: 'new-project', workspaceId: 'w', name, path: projectPath, createdAt: ts }
        projects.push(p)
        return json(p)
      }
      return json(projects)
    }
    if (path.endsWith('/sessions')) {
      const workspaceId = path.split('/').at(-2)
      if (workspaceId === undefined) throw new Error(`Fixture session endpoint is missing workspace ID: ${path}`)
      if (method === 'POST') {
        if (options.delayCreation) await creationReady
        const projectId = typeof body.projectId === 'string' ? body.projectId : null
        const s = {
          id: 'new',
          workspaceId,
          title: 'New conversation',
          ...(projectId === null ? {} : { projectId }),
          folder: null,
          eventCount: 0,
          createdAt: ts,
          updatedAt: ts,
        }
        sessions.push(s)
        return json(s)
      }
      return json(sessions.filter((session) => session.workspaceId === workspaceId))
    }
    if (path.endsWith('/messages') && method === 'POST' && options.failFirstSend) return route.fulfill({ status: 503, body: 'fixture send failure' })
    if (path.endsWith('/meta')) return json({ workspaceId: 'w', provider: 'p1', model: 'model-one', providers: [provider], policy: { Bash: 'ask' } })
    if (path.endsWith('/mode')) return json({ modes: [{ id: 'ask-before-changes', name: 'Ask before changes', source: 'bundled' }, { id: 'custom', name: 'Chế độ riêng', source: 'workspace' }], selected: 'ask-before-changes', revision: 1 })
    if (path.endsWith('/manifest')) return json({ modeId: 'ask-before-changes', modeRevision: 1, budget: { availableTokens: 32000, usedTokens: 1280, estimated: true }, history: { setting: 'recent', includedTurns: 1, omittedTurns: 0 }, sources: { skills: [], memory: [], toolNames: ['read_file'], toolSchemas: 1 }, omissions: [] })
    if (path.endsWith('/agents')) return json(['explorer', 'worker', 'imported-reviewer'].map(name => ({ source: name === 'imported-reviewer' ? 'workspace' : 'bundled', definition: { name, description: 'Catalog agent', tools: ['Read'], disallowedTools: [] } })))
    if (path.endsWith('/agents/children')) return json([{ childSessionId: 'child', definitionName: 'explorer', status: 'running' }])
    if (/\/agents\/(explorer|worker)$/.test(path) && method === 'POST') return json({ childSessionId: 'child', definitionName: 'explorer', status: 'running' })
    if (/\/agents\/(explorer|worker)$/.test(path)) return json({ source: 'bundled', definition: { name: path.split('/').at(-1), description: 'Read-only investigation', tools: ['Read'], disallowedTools: ['Bash'] } })
    if (path.endsWith('/mcp')) return json([{ name: 'local-files', transport: 'stdio', enabled: false, status: 'disabled', breakerOpenUntil: null }])
    if (path.endsWith('/hooks')) return json({ version: 1, hooks: {} })
    if (path.endsWith('/secrets')) return json([{ name: 'MCP_TOKEN' }])
    if (path.includes('/providers')) { if (path.endsWith('/test')) return json({ ok: true }); if (path.endsWith('/sync')) return json({ models: ['model-one', 'model-two'] }); return json({ ...provider, ...body }) }
    if (path.includes('/secrets/')) return json({ rotated: path.split('/').at(-1), reconnected: [] })
    if (path.endsWith('/import')) return json({ imported: ['imported'], blocked: [], spawned: false, active: false })
    return json({ ok: true, status: 'ready', saved: true, inputId: 'input', queued: true })
  })
  await page.goto(options.initialPath ?? (options.startAtRoot === true ? '/' : '/workspaces/w/sessions/s'))
  await expect(page.getByRole('button', { name: 'Open settings', exact: true })).toBeVisible()
  await expect(page.getByText('Research workspace', { exact: true }).first()).toBeVisible()
  // Exercise the same focus refresh used when a browser tab becomes active;
  // the routed listing must validate the selected session before its SSE opens.
  // Empty-workspace creation tests intentionally skip it: their send is the
  // listing transition under test.
  if (!options.empty) await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  return requests
}

test('workbench ownership, exact disclosures, settings tabs, viewport and accessibility evidence', async ({ page }) => {
  mkdirSync(out, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await fixture(page)
  await expect(page.getByText('Project scope stays fixed')).toBeVisible()
  await expect(page.locator('.topbar')).toHaveCSS('height', '48px')
  await expect(page.locator('.sidebar')).toHaveCSS('width', '280px')
  await expect(page.locator('.composer')).toHaveCSS('max-width', '760px')
  await expect(page.locator('.env-panel')).toBeVisible()
  await expect(page.locator('.env-panel')).toHaveCSS('width', '336px')
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
  const transcriptTool = page.locator('.transcript .tool-head')
  await transcriptTool.evaluate((element: HTMLButtonElement) => element.click())
  await expect(page.locator('.transcript .tool-output').last()).toContainText('dữ liệu gốc')
  await page.locator('.thinking-head').evaluate((element: HTMLButtonElement) => element.click())
  await expect(page.locator('.thinking-body')).toContainText('immutable ownership')
  await expect(page.locator('.env-panel [role=combobox], .env-panel select')).toHaveCount(0)
  await page.screenshot({ path: `${out}/1440-inspector.png` })
  await page.getByRole('button', { name: 'Close context inspector' }).click()
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    if (width > 1024 && !await page.locator('.sidebar').isVisible()) await page.getByRole('button', { name: 'Open conversation navigation' }).click()
    if (width <= 1024 && await page.locator('.sidebar').isVisible()) await page.keyboard.press('Escape')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `${out}/${width}-conversation.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  for (const tab of ['Providers', 'Agents', 'MCP', 'Hooks', 'Secrets', 'Projects']) {
    await page.getByRole('tab', { name: new RegExp(tab) }).click()
    await expect(page.getByRole('tabpanel').filter({ visible: true })).toBeVisible()
    await page.screenshot({ path: `${out}/settings-${tab}.png` })
    const result = await new AxeBuilder({ page }).include('.settings-modal').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])
  }
  await page.setViewportSize({ width: 320, height: 900 })
  await page.getByLabel('Settings section', { exact: true }).click()
  await page.getByRole('option', { name: 'Providers', exact: true }).click()
  await page.screenshot({ path: `${out}/320-settings.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open settings', exact: true })).toBeFocused()
})

test('active no-modal draft flow creates a scoped conversation on first send', async ({ page }) => {
  const requests = await fixture(page, { empty: true, startAtRoot: true })
  await page.getByLabel('Message', { exact: true }).fill('Start a scoped conversation')
  await page.getByLabel('Send', { exact: true }).click()
  await expect.poll(() => requests.find(r => r.method === 'POST' && r.path.endsWith('/sessions'))?.body).toEqual({})
  await expect(page).toHaveURL('/workspaces/w/sessions/new')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('browser history restores a validated selected conversation and fails closed for invalid links', async ({ page }) => {
  const requests = await fixture(page, { startAtRoot: true })
  await expect(page).toHaveURL('/workspaces/w')
  await page.getByText('Review workspace isolation', { exact: true }).first().click()
  await expect(page).toHaveURL('/workspaces/w/sessions/s')
  await page.goBack()
  await expect(page).toHaveURL('/workspaces/w')
  await page.goto('/workspaces/w/sessions/missing')
  await expect(page).toHaveURL('/workspaces/w')
  expect(requests.some((request) => request.path.endsWith('/sessions/missing/events'))).toBe(false)
  await page.goto('/not-a-route')
  await expect(page).toHaveURL('/workspaces/w')
})

test('an invalid deep link is validated before it can open SSE', async ({ page }) => {
  const requests = await fixture(page, { initialPath: '/workspaces/w/sessions/foreign' })
  await expect(page).toHaveURL('/workspaces/w')
  expect(requests.filter((request) => request.path.endsWith('/events'))).toEqual([])
})

test('a delayed first-session creation cannot hijack a workspace switch', async ({ page }) => {
  const requests = await fixture(page, { empty: true, startAtRoot: true, delayCreation: true })
  await page.getByLabel('Message', { exact: true }).fill('Keep sending after navigation changes')
  await page.getByLabel('Send', { exact: true }).click()
  await expect.poll(() => requests.some((request) => request.method === 'POST' && request.path.endsWith('/sessions'))).toBe(true)
  await page.getByRole('button', { name: 'Research workspace', exact: true }).click()
  await page.getByRole('button', { name: 'Không dịch workspace', exact: true }).click()
  await expect(page).toHaveURL('/workspaces/w2')
  requests.releaseCreation()
  await expect.poll(() => requests.some((request) => request.method === 'POST' && request.path.endsWith('/messages'))).toBe(true)
  await expect(page).toHaveURL('/workspaces/w2')
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('')
})

test('a failed first send preserves the draft and error in its created session', async ({ page }) => {
  const requests = await fixture(page, { empty: true, startAtRoot: true, failFirstSend: true })
  await page.getByLabel('Message', { exact: true }).fill('Recover this first message')
  await page.getByLabel('Send', { exact: true }).click()
  await expect(page).toHaveURL('/workspaces/w/sessions/new')
  await expect(page.getByRole('alert')).toContainText('Send not confirmed')
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Recover this first message')
  expect(requests.some((request) => request.method === 'POST' && request.path.endsWith('/messages'))).toBe(true)
})

test('approval is once-only and shows exact arguments without widening scope', async ({ page }) => {
  const requests = await fixture(page, { approval: true })
  await expect(page.getByRole('button', { name: 'Allow once', exact: true })).toBeVisible()
  await page.getByText('Exact arguments · approval-call').click()
  await expect(page.locator('.approval pre')).toContainText('npm test -- scope')
  await page.screenshot({ path: `${out}/approval.png` })
  await page.getByRole('button', { name: 'Allow once', exact: true }).click()
  await expect(page.locator('.approval')).toHaveCount(0)
  const answers = requests.filter(r => r.path.includes('/approvals/') && r.method === 'POST')
  expect(answers).toHaveLength(1)
  expect(answers[0]?.body).toEqual({ allow: true })
})

test('provider draft survives tabs; save, test, sync, activation and destructive confirmation remain available', async ({ page }) => {
  const requests = await fixture(page)
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Edited local provider')
  await page.getByRole('tab', { name: /Hooks/ }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved provider changes?' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('tab', { name: /Providers/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Edited local provider')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  await page.getByRole('button', { name: 'Test connection', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Connection verified')
  await page.getByRole('button', { name: 'Sync from /models', exact: true }).click()
  await page.getByRole('button', { name: 'Use in workspace', exact: true }).first().click()
  await page.getByRole('button', { name: 'Delete provider', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Delete permanently', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(requests.some(r => r.method === 'DELETE')).toBe(false)
  expect(requests.find(r => r.method === 'PATCH' && r.path.includes('/providers'))?.body.apiKey).toBeUndefined()
})


test('management operations preserve writable controls and explicit destructive decisions', async ({ page }) => {
  const requests = await fixture(page)
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.getByRole('tab', { name: /Agents/ }).click()
  await page.getByLabel('Objective', { exact: true }).fill('Inspect only')
  await page.getByRole('button', { name: 'Spawn explorer', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Spawned explorer' })).toBeVisible()
  await page.getByRole('button', { name: 'Refresh children', exact: true }).click()
  await expect(page.getByText('running', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect.poll(() => requests.some(r => r.method === 'POST' && r.path.endsWith('/children/child/cancel'))).toBe(true)
  await page.getByLabel('Target name', { exact: true }).fill('reviewer')
  await page.getByLabel('Definition content', { exact: true }).fill('Inspect only')
  await page.getByRole('button', { name: 'Import definition', exact: true }).click()
  await page.getByRole('tab', { name: /MCP/ }).click()
  await page.getByRole('button', { name: 'Enable', exact: true }).click()
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click()
  await page.getByLabel('Server name', { exact: true }).fill('new-server')
  await page.getByLabel('Command', { exact: true }).fill('node')
  await page.getByRole('button', { name: 'Save server', exact: true }).click()
  await page.getByLabel('Content', { exact: true }).fill('{"mcpServers":{}}')
  await page.getByRole('button', { name: 'Import servers', exact: true }).click()
  await page.getByRole('tab', { name: /Hooks/ }).click()
  await page.getByRole('button', { name: 'Advanced · edit raw JSON', exact: true }).click()
  await page.getByLabel('hooks.json', { exact: true }).fill('{invalid')
  await page.getByRole('button', { name: 'Apply raw', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid JSON')
  await page.getByLabel('hooks.json', { exact: true }).fill('{"version":1,"hooks":{"PreToolUse":[]}}')
  await page.getByRole('button', { name: 'Apply raw', exact: true }).click()
  await page.getByRole('button', { name: 'Save hooks', exact: true }).click()
  await page.getByRole('tab', { name: /Secrets/ }).click()
  await page.getByLabel('Key name', { exact: true }).fill('MCP_TOKEN')
  await page.getByLabel('Value', { exact: true }).fill('fixture-only-secret')
  await page.getByRole('button', { name: 'Save / rotate key', exact: true }).click()
  await expect(page.getByLabel('Value', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Delete MCP_TOKEN', exact: true }).click()
  expect(requests.some(r => r.method === 'DELETE')).toBe(false)
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click()
  await expect.poll(() => requests.filter(r => r.method === 'DELETE').length).toBe(1)
  expect(requests.find(r => r.path.endsWith('/mcp/new-server'))?.body.enabled).toBe(false)
  expect(requests.find(r => r.path.endsWith('/agents/explorer') && r.method === 'POST')?.body.rootSessionId).toBe('s')
})

test('keyboard drawers, 200 percent equivalent reflow and coarse targets', async ({ page, browser }) => {
  await page.setViewportSize({ width: 720, height: 500 })
  await fixture(page)
  await page.getByRole('button', { name: 'Open conversation navigation', exact: true }).click()
  await expect(page.locator('.sidebar .new-session')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.sidebar')).not.toBeVisible()
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.getByRole('tab', { name: /Providers/ }).focus()
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: /Secrets/ })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(page.getByRole('tab', { name: /Providers/ })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: out + '/zoom-200-equivalent-720.png' })
  const touch = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  const mobile = await touch.newPage(); await fixture(mobile)
  for (const b of await mobile.locator('.topbar button').all()) { const box = await b.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44) }
  await mobile.getByRole('button', { name: 'Open settings', exact: true }).click()
  await mobile.screenshot({ path: out + '/coarse-mobile-settings.png' })
  await touch.close()
})


test('workspace popover Escape restores focus and custom names remain unchanged', async ({ page }) => {
  const requests = await fixture(page)
  const picker = page.getByRole('button', { name: 'Research workspace', exact: true })
  await picker.click()
  await expect(picker).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(picker).toHaveAttribute('aria-expanded', 'false')
  await expect(picker).toBeFocused()
  await picker.click()
  await page.getByRole('button', { name: 'Không dịch workspace', exact: true }).click()
  await expect(page.locator('.topbar-workspace b')).toHaveText('Không dịch workspace')
  expect(requests.some(r => r.method !== 'GET')).toBe(false)
})

test('project rename and removal use owning workspace and explicit confirmation', async ({ page }) => {
  const requests = await fixture(page)
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.getByRole('tab', { name: /Projects/ }).click()
  await page.getByRole('tabpanel').getByRole('button', { name: 'Rename', exact: true }).click()
  await page.getByLabel('New project name').fill('Tên mới giữ nguyên')
  await page.getByRole('button', { name: 'Save name', exact: true }).click()
  await expect.poll(() => requests.some(r => r.method === 'PATCH' && r.path.endsWith('/projects/p'))).toBe(true)
  expect(requests.find(r => r.method === 'PATCH' && r.path.endsWith('/projects/p'))?.body).toEqual({ name: 'Tên mới giữ nguyên' })
  await page.getByRole('button', { name: 'Remove project', exact: true }).click()
  expect(requests.some(r => r.method === 'DELETE')).toBe(false)
  await page.getByRole('button', { name: 'Remove registration', exact: true }).click()
  await expect.poll(() => requests.some(r => r.method === 'DELETE' && r.path === '/api/workspaces/w/projects/p')).toBe(true)
})


test('mobile settings scroll every field above footer and expose all scoped sections', async ({ browser }) => {
  for (const width of [320, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 812 }, isMobile: true, hasTouch: true })
    const page = await context.newPage(); await fixture(page)
    await page.getByRole('button', { name: 'Open settings', exact: true }).click()
    const selector = page.getByLabel('Settings section', { exact: true })
    await expect(selector).toBeVisible()
    await selector.click()
    await expect(page.getByRole('option')).toHaveCount(8)
    await page.getByRole('option', { name: 'Providers', exact: true }).click()
    await page.screenshot({ path: `${out}/${width}-settings-fixed-top.png` })
    const panel = page.getByRole('tabpanel').filter({ visible: true })
    for (const label of ['Name', 'Base URL', 'API key']) {
      const field = page.getByLabel(label, { exact: true })
      await field.scrollIntoViewIfNeeded()
      const bounds = await field.boundingBox(); const footer = await page.locator('.settings-foot').boundingBox()
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(footer!.y)
      await field.focus(); await expect(field).toBeFocused()
    }
    await panel.evaluate(node => { node.scrollTop = node.scrollHeight })
    const last = page.locator('.model-add input'); await expect(last).toBeVisible()
    const bounds = await last.boundingBox(); const footer = await page.locator('.settings-foot').boundingBox()
    expect(bounds!.y + bounds!.height + 16).toBeLessThanOrEqual(footer!.y)
    expect(await panel.evaluate(node => node.scrollTop)).toBeGreaterThan(0)
    await page.screenshot({ path: `${out}/${width}-settings-fixed-bottom.png` })
    for (const section of ['hooks', 'secrets', 'mcp', 'agents', 'projects', 'providers']) {
      await selector.click()
      await page.getByRole('option', { name: section === 'mcp' ? 'MCP' : section[0]!.toUpperCase() + section.slice(1), exact: true }).click()
      await expect(page.getByRole('tabpanel').filter({ visible: true }).locator('h2').first()).toHaveText(section === 'mcp' ? 'MCP' : section[0]!.toUpperCase() + section.slice(1))
    }
    await selector.click()
    await page.getByRole('option', { name: 'Hooks', exact: true }).click()
    expect(await page.getByRole('tabpanel').filter({ visible: true }).evaluate(node => node.scrollTop)).toBe(0)
    await expect(page.locator('.manage-warning')).toContainText('not an OS sandbox')
    await page.screenshot({ path: `${out}/${width}-settings-fixed-hooks.png` })
    await context.close()
  }
})


test('keyless provider creation and imported catalog inspect spawn delete work in browser', async ({ page }) => {
  const requests = await fixture(page)
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.locator('.provider-row-new').click()
  await page.getByLabel('Name', { exact: true }).fill('Keyless gateway')
  await page.getByLabel('Base URL', { exact: true }).fill('http://localhost:8081/v1')
  await page.locator('.settings-foot').getByRole('button', { name: 'Add provider', exact: true }).click()
  await expect.poll(() => requests.some(r => r.path === '/api/providers' && r.method === 'POST')).toBe(true)
  expect(requests.find(r => r.path === '/api/providers' && r.method === 'POST')?.body.apiKey).toBe('')
  await page.getByRole('tab', { name: /Agents/ }).click()
  await expect(page.getByRole('dialog', { name: 'Discard unsaved provider changes?' })).toBeVisible()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await page.getByRole('button', { name: /imported-reviewer.*workspace/ }).click()
  await page.getByText('Inspect selected definition', { exact: true }).click()
  await expect(page.locator('pre').filter({ hasText: 'imported-reviewer' })).toBeVisible()
  await page.getByLabel('Objective', { exact: true }).fill('Inspect only')
  await page.getByRole('button', { name: 'Spawn imported-reviewer', exact: true }).click()
  await page.getByRole('button', { name: 'Delete selected agent', exact: true }).click()
  await page.getByRole('button', { name: 'Delete definition', exact: true }).click()
  await expect.poll(() => requests.some(r => r.method === 'DELETE' && r.path.endsWith('/agents/imported-reviewer'))).toBe(true)
})
