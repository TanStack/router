import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const toolchain = process.env.E2E_TOOLCHAIN ?? 'vite'
const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`
// Development: the Start dev server of the toolchain renders module routes,
// runs their server functions and hot-updates their files.
const command = `node scripts/prepare.mjs && pnpm --filter @start-route-modules/web dev:${toolchain} --host 0.0.0.0 --port ${PORT}`

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
