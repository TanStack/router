import { defineConfig, devices } from '@playwright/test'
import { getPort, resolveRuntimeSuffix } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const PORT = await getPort(
  packageJson.name + `-${resolveRuntimeSuffix('hash')}`,
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
    command: `VITE_SERVER_PORT=${PORT} VITE_APP_HISTORY=hash vite build --outDir dist-hash && VITE_SERVER_PORT=${PORT} VITE_APP_HISTORY=hash pnpm serve --port ${PORT} --outDir dist-hash`,
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
