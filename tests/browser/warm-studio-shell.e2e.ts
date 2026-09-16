import { expect, test, type Locator, type Page } from '@playwright/test'

const DESKTOP_WIDTHS = [1440, 1920] as const

async function fixture(page: Page): Promise<void> {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const json = (value: unknown) => route.fulfill({ json: value })
    if (path === '/api/workspaces') return json([{ id: 'w', name: 'Fixture workspace', default: true, createdAt: 0 }])
    if (path.endsWith('/projects')) return json([{ id: 'p', workspaceId: 'w', name: 'Fixture project', path: 'C:/fixture', createdAt: 0 }])
    if (path.endsWith('/sessions')) return json([{ id: 's', workspaceId: 'w', title: 'Fixture conversation', projectId: 'p', folder: null, eventCount: 0, createdAt: 0, updatedAt: 0 }])
    if (path.endsWith('/meta')) return json({ workspaceId: 'w', provider: '', model: '', providers: [], models: [], policy: {} })
    if (path.endsWith('/mode')) return json({ modes: [], selected: null, revision: 1 })
    if (path.endsWith('/events')) return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"kind":"snapshot","events":[]}\n\n' })
    return json({ ok: true })
  })
  await page.goto('/workspaces/w')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByRole('button', { name: 'Open settings', exact: true })).toBeVisible()
}

async function noOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

async function drag(page: Page, separator: Locator, delta: number): Promise<void> {
  const box = await separator.boundingBox()
  if (box === null) throw new Error('Separator is not visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2)
  await page.mouse.up()
}

async function expectWidth(panel: Locator, expected: number): Promise<void> {
  await expect.poll(async () => Math.round((await panel.boundingBox())?.width ?? 0)).toBeGreaterThanOrEqual(expected - 2)
  await expect.poll(async () => Math.round((await panel.boundingBox())?.width ?? 0)).toBeLessThanOrEqual(expected + 2)
}

async function expectPanelState(page: Page, side: 'left' | 'right', open: boolean): Promise<void> {
  await expect(page.locator(`[data-workbench-${side}]`)).toHaveCount(open ? 1 : 0)
}

test('has the approved 1440 desktop geometry and no overflow at all supported widths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await fixture(page)
  await expect(page.locator('[data-workbench-topbar]')).toHaveCSS('width', '1440px')
  await expectWidth(page.locator('[data-workbench-left]'), 280)
  await expectWidth(page.locator('[data-workbench-right]'), 336)
  await noOverflow(page)
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await noOverflow(page)
  }
})

test('uses accessible transient drawers below their dock breakpoints', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 })
  await fixture(page)
  const navOpener = page.getByRole('button', { name: 'Open conversation navigation', exact: true })
  await navOpener.click()
  const navigation = page.getByRole('dialog', { name: 'Conversation navigation' })
  await expect(navigation).toBeVisible()
  const focusables = navigation.locator('button:not(:disabled), input:not(:disabled)')
  await focusables.first().focus(); await page.keyboard.press('Shift+Tab')
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute('aria-label'))).toBe('Conversation navigation')
  await focusables.last().focus(); await page.keyboard.press('Tab')
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute('aria-label'))).toBe('Conversation navigation')
  await page.getByRole('button', { name: /Fixture conversation/ }).click()
  await expect(navigation).toHaveCount(0)
  await expect(page).toHaveURL('/workspaces/w/sessions/s')

  const inspectorOpener = page.getByRole('button', { name: 'Open context inspector', exact: true })
  await inspectorOpener.click()
  const inspector = page.getByRole('dialog', { name: 'Context inspector' })
  await expect(inspector).toBeVisible()
  await page.keyboard.press('Tab')
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute('aria-label'))).toBe('Context inspector')
  await page.keyboard.press('Escape')
  await expect(inspector).toHaveCount(0)
  await expect(inspectorOpener).toBeFocused()
  await inspectorOpener.click()
  await page.locator('[data-workbench-scrim]').click({ position: { x: 4, y: 4 } })
  await expect(inspectorOpener).toBeFocused()
})

test('navigation drawer independently restores its opener after Escape and scrim close', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 })
  await fixture(page)
  const opener = page.getByRole('button', { name: 'Open conversation navigation', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Conversation navigation' })
  await opener.click(); await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused()
  await opener.click(); await page.locator('[data-workbench-scrim]').click({ position: { x: 700, y: 4 } })
  await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused()
})

test('keeps the left dock open at exactly 1024 while the right is a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await fixture(page)
  await expectPanelState(page, 'left', true)
  await expectPanelState(page, 'right', false)
  await page.getByRole('button', { name: 'Open context inspector', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Context inspector' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Context inspector' })).toHaveCount(0)
  await page.locator('[data-workbench-left]').getByRole('button', { name: /Fixture conversation/ }).click()
  await expectPanelState(page, 'left', true)
  await expect(page).toHaveURL('/workspaces/w/sessions/s')
})

for (const width of DESKTOP_WIDTHS) {
  test(`persists pointer-resized widths before separately resetting them at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await fixture(page)
    const leftSeparator = page.getByRole('separator', { name: 'Resize conversation navigation' })
    await drag(page, leftSeparator, 60)
    await expect(leftSeparator).toHaveAttribute('aria-valuenow', '340')
    await expectWidth(page.locator('[data-workbench-left]'), 340)
    await page.reload()
    await expect(leftSeparator).toHaveAttribute('aria-valuenow', '340')
    await expectWidth(page.locator('[data-workbench-left]'), 340)
    await leftSeparator.dblclick()
    await expect(leftSeparator).toHaveAttribute('aria-valuenow', '280')
    await expectWidth(page.locator('[data-workbench-left]'), 280)

    const rightSeparator = page.getByRole('separator', { name: 'Resize context inspector' })
    await drag(page, rightSeparator, -60)
    await expect(rightSeparator).toHaveAttribute('aria-valuenow', '396')
    await expectWidth(page.locator('[data-workbench-right]'), 396)
    await page.reload()
    await expect(rightSeparator).toHaveAttribute('aria-valuenow', '396')
    await expectWidth(page.locator('[data-workbench-right]'), 396)
    await rightSeparator.focus(); await page.keyboard.press('ArrowLeft')
    await expect(rightSeparator).toHaveAttribute('aria-valuenow', '404')
    await rightSeparator.dblclick()
    await expect(rightSeparator).toHaveAttribute('aria-valuenow', '336')
    await expectWidth(page.locator('[data-workbench-right]'), 336)
  })


  test(`persists independent panel collapse and reopen state at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await fixture(page)
    const leftToggle = page.getByRole('button', { name: 'Close conversation navigation', exact: true })
    const rightToggle = page.getByRole('button', { name: 'Close context inspector', exact: true })

    await leftToggle.click()
    await expectPanelState(page, 'left', false); await expectPanelState(page, 'right', true)
    await page.reload()
    await expectPanelState(page, 'left', false); await expectPanelState(page, 'right', true)
    await page.getByRole('button', { name: 'Open conversation navigation', exact: true }).click()
    await expectPanelState(page, 'left', true); await expectPanelState(page, 'right', true)
    await page.reload()
    await expectPanelState(page, 'left', true); await expectPanelState(page, 'right', true)

    await rightToggle.click()
    await expectPanelState(page, 'left', true); await expectPanelState(page, 'right', false)
    await page.reload()
    await expectPanelState(page, 'left', true); await expectPanelState(page, 'right', false)
    await page.getByRole('button', { name: 'Open context inspector', exact: true }).click()
    await expectPanelState(page, 'left', true); await expectPanelState(page, 'right', true)
    await page.reload()
    await expectPanelState(page, 'left', true); await expectPanelState(page, 'right', true)
  })

  test(`applies exact keyboard increments and bounds at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await fixture(page)
    const left = page.getByRole('separator', { name: 'Resize conversation navigation' })
    const right = page.getByRole('separator', { name: 'Resize context inspector' })

    await left.focus(); await page.keyboard.press('ArrowRight'); await expect(left).toHaveAttribute('aria-valuenow', '288')
    await left.focus(); await page.keyboard.press('Home'); await expect(left).toHaveAttribute('aria-valuenow', '232')
    await left.focus(); await page.keyboard.press('End'); await expect(left).toHaveAttribute('aria-valuenow', '420')
    await left.dblclick(); await expect(left).toHaveAttribute('aria-valuenow', '280')

    await right.focus(); await page.keyboard.press('ArrowLeft'); await expect(right).toHaveAttribute('aria-valuenow', '344')
    await right.focus(); await page.keyboard.press('Home'); await expect(right).toHaveAttribute('aria-valuenow', '280')
    await right.focus(); await page.keyboard.press('End'); await expect(right).toHaveAttribute('aria-valuenow', '520')
    await right.dblclick(); await expect(right).toHaveAttribute('aria-valuenow', '336')
  })
}
