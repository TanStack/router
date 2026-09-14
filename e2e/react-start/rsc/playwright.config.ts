import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const e2ePortKey = process.env.E2E_PORT_KEY ?? packageJson.name
const distDir = process.env.E2E_DIST_DIR ?? 'dist'

if (process.env.TEST_WORKER_INDEX === undefined) {
  for (const portFile of [`port-${e2ePortKey}.txt`]) {
    fs.rmSync(portFile, { force: true })
  }
}

const PORT = await getTestServerPort(e2ePortKey)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],

  use: {
    baseURL,
  },

  webServer: {
    command: 'pnpm start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    env: {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=@tanstack/router-e2e-utils/mock-api`,
      PORT: String(PORT),
      E2E_DIST_DIR: distDir,
      E2E_PORT_KEY: e2ePortKey,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
