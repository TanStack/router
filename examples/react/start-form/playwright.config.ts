import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  use: { browserName: 'chromium', baseURL: 'http://localhost:3150' },
  webServer: {
    command:
      process.env.FORM_PRODUCTION === '1'
        ? 'PORT=3150 node .output/server/index.mjs'
        : 'pnpm dev',
    url: 'http://localhost:3150',
    timeout: 120_000,
  },
})
