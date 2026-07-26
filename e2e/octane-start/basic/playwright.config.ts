import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const e2ePortKey = process.env.E2E_PORT_KEY ?? packageJson.name
const distDir = process.env.E2E_DIST_DIR ?? '.output'
const isDev = process.env.E2E_DEV === 'true'

if (process.env.TEST_WORKER_INDEX === undefined) {
  fs.rmSync(`port-${e2ePortKey}.txt`, { force: true })
}

const port = await getTestServerPort(e2ePortKey)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  testMatch: isDev ? 'hmr.spec.ts' : 'basic.spec.ts',
  workers: 1,
  reporter: [['line']],
  use: { baseURL },
  webServer: {
    command: isDev
      ? `pnpm dev:e2e --host 127.0.0.1 --port ${port} --strictPort`
      : `PORT=${port} node ${distDir}/server/index.mjs`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    env: isDev
      ? { E2E_DEV: 'true' }
      : {
          NODE_ENV: 'production',
        },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
