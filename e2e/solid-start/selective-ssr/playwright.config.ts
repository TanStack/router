import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }
import { devBaseURL, devPort } from './dev-server'

const PORT = await getTestServerPort(packageJson.name)
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

  webServer: [
    {
      command: `VITE_SERVER_PORT=${PORT} pnpm build && NODE_ENV=production PORT=${PORT} VITE_SERVER_PORT=${PORT} pnpm start`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
    },
    {
      command: `NODE_ENV=development VITE_SERVER_PORT=${devPort} pnpm dev:e2e --host localhost --port ${devPort} --strictPort`,
      url: devBaseURL,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      timeout: 90_000,
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
