import { defineConfig, devices } from '@playwright/test'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',

  reporter: [['line']],

  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3090/',
  },

  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3090',
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
