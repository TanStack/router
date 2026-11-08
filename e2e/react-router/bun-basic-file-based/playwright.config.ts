import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const port = Number(process.env.E2E_APP_PORT ?? 0)

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...devices['Desktop Chrome'],
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: 'bun build.mjs --serve',
    env: { E2E_APP_PORT: String(port) },
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
})
