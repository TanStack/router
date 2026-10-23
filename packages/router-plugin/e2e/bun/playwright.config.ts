import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_APP_PORT ?? 43187)

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
    url: `http://127.0.0.1:${port}/__builds`,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
})
