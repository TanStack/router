import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `NODE_OPTIONS=--conditions=@repo/source pnpm exec vite preview --configLoader native --host 127.0.0.1 --port ${PORT}`,
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
