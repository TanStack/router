import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import {
  getDummyServerPort,
  getTestServerPort,
} from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const mode = process.env.MODE ?? 'ssr'
const e2ePortKey = process.env.E2E_PORT_KEY ?? packageJson.name
const distDir = process.env.E2E_DIST_DIR ?? 'dist'

if (process.env.TEST_WORKER_INDEX === undefined) {
  for (const portFile of [
    `port-${e2ePortKey}.txt`,
    `port-${e2ePortKey}-external.txt`,
  ]) {
    fs.rmSync(portFile, { force: true })
  }
}

const PORT = await getTestServerPort(e2ePortKey)
const EXTERNAL_PORT = await getDummyServerPort(e2ePortKey)
const baseURL = `http://localhost:${PORT}`
const command =
  mode === 'preview' ? `pnpm preview --port ${PORT}` : 'pnpm start'

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],

  globalSetup: './tests/setup/global.setup.ts',
  globalTeardown: './tests/setup/global.teardown.ts',

  use: {
    baseURL,
  },

  webServer: {
    command,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    env: {
      MODE: mode,
      PORT: String(PORT),
      E2E_DIST_DIR: distDir,
      E2E_PORT_KEY: e2ePortKey,
      EXTERNAL_SERVER_URL: `http://localhost:${EXTERNAL_PORT}`,
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
