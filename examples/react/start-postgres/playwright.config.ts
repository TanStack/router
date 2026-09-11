import 'dotenv/config'
import { defineConfig } from '@playwright/test'
const production = process.env.POSTGRES_EXAMPLE_PRODUCTION === '1'
export default defineConfig({
  testDir: './tests',
  use: { browserName: 'chromium', baseURL: 'http://localhost:3120' },
  webServer: {
    command: production ? 'PORT=3120 pnpm start' : 'pnpm dev',
    url: 'http://localhost:3120',
    timeout: 120_000,
  },
})
