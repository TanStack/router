import { defineConfig } from '@playwright/test'
const production = process.env.IMAGES_PRODUCTION === '1'
export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:3130', browserName: 'chromium' },
  webServer: {
    command: production ? 'PORT=3130 pnpm start' : 'pnpm dev',
    url: 'http://127.0.0.1:3130',
    timeout: 120_000,
  },
})
