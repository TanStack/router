import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const mode = process.env.MODE ?? 'ssr'
const e2ePortKey = process.env.E2E_PORT_KEY ?? packageJson.name
const distDir = process.env.E2E_DIST_DIR ?? 'dist'

if (process.env.TEST_WORKER_INDEX === undefined) {
  for (const portFile of [
    `port-${e2ePortKey}.txt`,
    `port-${e2ePortKey}_start.txt`,
  ]) {
    fs.rmSync(portFile, { force: true })
  }
}

const PORT = await getTestServerPort(e2ePortKey)
const START_PORT = await getTestServerPort(`${e2ePortKey}_start`)
const baseURL = `http://localhost:${PORT}`
const commandByMode =
  mode === 'preview'
    ? `pnpm preview --host 0.0.0.0 --outDir ${distDir} --port ${PORT}`
    : `pnpm start`

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],

  use: {
    baseURL,
  },

  webServer: {
    command: commandByMode,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    env: {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=@tanstack/router-e2e-utils/mock-api`,
      MODE: mode,
      VITE_NODE_ENV: 'test',
      VITE_SERVER_PORT: String(PORT),
      START_PORT: String(START_PORT),
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
