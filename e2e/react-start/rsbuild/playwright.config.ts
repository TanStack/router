import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],

  use: {
    baseURL,
  },

  // The overlay is a dev-server feature: the suite edits a route under
  // `rsbuild dev`.
  webServer: {
    command: `pnpm exec rsbuild dev --port ${PORT}`,
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      PORT: String(PORT),
      VITE_SERVER_PORT: String(PORT),
      VITE_NODE_ENV: 'test',
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
