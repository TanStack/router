import { defineConfig, devices } from '@playwright/test'
import { derivePort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const PORT = await derivePort(packageJson.name)
const baseURL = `http://localhost:${PORT}`
const EXTERNAL_PORT = await derivePort(`${packageJson.name}-external`)
/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  workers: 1,

  reporter: [['line']],

  globalSetup: './tests/setup/global.setup.ts',
  globalTeardown: './tests/setup/global.teardown.ts',

  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,
  },

  webServer: {
    command: `pnpm run build && pnpm run serve --serve=${PORT} --define:process.env.NODE_ENV=\\"test\\" --define:process.env.EXTERNAL_PORT="${EXTERNAL_PORT}"`,
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
