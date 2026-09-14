import { defineConfig, devices } from '@playwright/test'
import {
  getTestServerPort,
  resolveRuntimeSuffix,
} from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const PORT = await getTestServerPort(
  packageJson.name + `-${resolveRuntimeSuffix('browser')}`,
)
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
    command: `VITE_NODE_ENV="test" VITE_SERVER_PORT=${PORT} VITE_APP_HISTORY=browser pnpm build && VITE_NODE_ENV="test" VITE_SERVER_PORT=${PORT} VITE_APP_HISTORY=browser pnpm preview --port ${PORT}`,
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
