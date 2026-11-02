import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`
// Nx builds the application with the toolchain of each mode into
// `E2E_DIST_DIR` (`build:<toolchain>:ssr` publishes the route modules first);
// this serves that build. Module files are compiled from source by the
// application.
const command = `cd packages/web && NODE_ENV=production PORT=${PORT} pnpm start`

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL,
  },
  webServer: {
    command,
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
