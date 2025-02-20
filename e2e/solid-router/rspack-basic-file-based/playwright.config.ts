import { defineConfig, devices } from '@playwright/test'
import { derivePort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const PORT = derivePort(packageJson.name)
const baseURL = `http://localhost:${PORT}`
/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  workers: 1,

  reporter: [['line']],

  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,
  },

  webServer: {
    command: `PUBLIC_SERVER_PORT=${PORT} pnpm build && PUBLIC_SERVER_PORT=${PORT} pnpm preview --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
