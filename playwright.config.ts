import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser', testMatch: '**/*.e2e.ts', workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'artifacts/product-ui/playwright-report', open: 'never' }]],
  outputDir: 'artifacts/product-ui/test-results',
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npx vite --host 127.0.0.1 --port 4175', url: 'http://127.0.0.1:4175', reuseExistingServer: true },
})
