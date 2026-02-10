import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const HOST_PORT = await getTestServerPort(packageJson.name)
const REMOTE_PORT = await getTestServerPort(`${packageJson.name}-remote`)
const baseURL = `http://localhost:${HOST_PORT}`

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],

  use: {
    baseURL,
  },

  webServer: [
    {
      command: `pnpm --dir ../module-federation-rsbuild-remote build && pnpm --dir ../module-federation-rsbuild-remote preview --port ${REMOTE_PORT}`,
      url: `http://localhost:${REMOTE_PORT}`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      env: {
        REMOTE_PORT: String(REMOTE_PORT),
      },
      timeout: 120_000,
    },
    {
      command: `pnpm build && pnpm start`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      env: {
        PORT: String(HOST_PORT),
        REMOTE_PORT: String(REMOTE_PORT),
      },
      timeout: 120_000,
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
