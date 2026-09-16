/* Hermetic UI smoke: seed a demo provider + models, screenshot the composer
   (thinking trigger) and the settings per-model editor. Run with node after
   `npx playwright install chromium` (already installed for test:browser). */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:3111'
const OUT = 'web/styles/artifacts'
mkdirSync(OUT, { recursive: true })

async function main() {
  const ws = (await (await fetch(`${BASE}/api/workspaces`)).json())[0].id
  await fetch(`${BASE}/api/providers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'demo',
      baseUrl: 'http://127.0.0.1:9/v1',
      apiKey: '',
      models: ['gpt-5.6', 'glm-5.2', 'kimi-k2.7-code', 'mystery-model'],
      modelSettings: { 'glm-5.2': { contextTokens: 300_000, vision: true, thinkingLevel: 'high' } },
    }),
  })
  await fetch(`${BASE}/api/workspaces/${ws}/model`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-5.6', provider: 'demo' }),
  })

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE)
  await page.waitForTimeout(1200)

  // 1. Composer with the thinking trigger.
  await page.screenshot({ path: `${OUT}/smoke-composer.png` })

  // 2. Thinking menu open.
  const thinking = page.getByRole('button', { name: /thinking level/i })
  if (await thinking.count()) {
    await thinking.first().click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/smoke-thinking-menu.png` })
    await page.keyboard.press('Escape')
  } else {
    console.log('NO THINKING TRIGGER FOUND')
  }

  // 3. Settings → provider → per-model editor expanded on glm-5.2.
  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /configure glm-5\.2/i }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/smoke-model-settings.png` })

  // 4. Model menu with capability badges.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Close settings' }).click()
  await page.waitForTimeout(400)
  const modelTrigger = page.locator('.composer-model-trigger')
  if (await modelTrigger.count()) {
    await modelTrigger.first().click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/smoke-model-menu.png` })
  }

  await browser.close()
  console.log('SMOKE-DONE')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
