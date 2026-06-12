import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

// Dedicated HMR test lane for the RSC app. Unlike playwright.config.ts (which
// runs the built server via `pnpm start`), HMR must run against the dev server.
const e2ePortKey = process.env.E2E_PORT_KEY ?? `${packageJson.name}-hmr`
const PORT = await getTestServerPort(e2ePortKey)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests-hmr',
  workers: 1,
  reporter: [['line']],

  use: {
    baseURL,
  },

  webServer: {
    command: `pnpm dev:vite --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      E2E_PORT_KEY: e2ePortKey,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
