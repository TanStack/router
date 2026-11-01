import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`
// Development: the application's dev server compiles module route files from
// their packages, code-splits them and hot-updates them.
const command = `node scripts/prepare.mjs && pnpm --filter @route-modules/web exec vite --host 0.0.0.0 --port ${PORT}`

export default defineConfig({
  testDir: './e2e-dev',
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL,
  },
  webServer: {
    command,
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
