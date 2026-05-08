import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: true,
  webServer: {
    command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3000',
      },
    },
  ],
})
