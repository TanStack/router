import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`
// Publish the route modules, then build and serve the application that mounts
// them. Only the application is bundled; modules are compiled from source.
const command = `node scripts/prepare.mjs && pnpm --filter @route-modules/web build && pnpm --filter @route-modules/web exec vite preview --host 0.0.0.0 --port ${PORT}`

export default defineConfig({
  testDir: './e2e',
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
