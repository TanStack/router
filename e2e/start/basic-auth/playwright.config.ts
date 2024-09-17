import { defineConfig, devices } from '@playwright/test'

import dotenv from 'dotenv'

dotenv.config()

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',

  reporter: [['line']],

  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000/',
  },

  webServer: {
    // TODO: build && start seems broken, use that if it's working
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },

  projects: [
    {
      name: 'mock-db-setup',
      testMatch: 'tests/mock-db-setup.test.ts',
      teardown: 'cleanup-mock-db',
    },
    {
      name: 'cleanup-mock-db',
      testMatch: 'tests/mock-db-teardown.test.ts',
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['mock-db-setup'],
    },
  ],
})
