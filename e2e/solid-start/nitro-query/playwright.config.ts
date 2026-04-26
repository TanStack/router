import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const PORT = await getTestServerPort(packageJson.name)
const baseURL = `http://localhost:${PORT}`

// #6151 only reproduces in dev — `@tanstack/solid-query` ships separate
// development/production builds. Production builds use a single file, so the
// dual-context bug can't manifest. This e2e is dev-only.
export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],
  use: { baseURL },
  webServer: {
    command: `PORT=${PORT} pnpm dev:e2e`,
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
