import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import packageJson from './package.json' with { type: 'json' }

const e2ePortKey = process.env.E2E_PORT_KEY ?? packageJson.name

if (process.env.TEST_WORKER_INDEX === undefined) {
  for (const portFile of [
    `port-${e2ePortKey}.txt`,
    `port-${e2ePortKey}-syntax-error-overlay.txt`,
  ]) {
    fs.rmSync(portFile, { force: true })
  }
}

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
