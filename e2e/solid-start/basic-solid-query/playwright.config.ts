import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const PORT = await getTestServerPort(packageJson.name)

const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  workers: 1,

  reporter: [['line']],

  use: {
    baseURL,
  },

  webServer: {
    command: `VITE_NODE_ENV="test" VITE_SERVER_PORT=${PORT} pnpm build && VITE_NODE_ENV="test" PORT=${PORT} VITE_SERVER_PORT=${PORT} pnpm start`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    env: {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=@tanstack/router-e2e-utils/mock-api`,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
