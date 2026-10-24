import { defineConfig, devices } from '@playwright/test'

if (!process.env.BUN_EXECUTABLE) {
  throw new Error('Set BUN_EXECUTABLE to the native development candidate')
}

export default defineConfig({
  testDir: '.',
  testMatch: 'dev.test.ts',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['line']],
  outputDir: process.env.BUN_DEV_TEST_OUTPUT ?? './.cache/bun-dev-results',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
})
