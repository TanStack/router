import { defineConfig, devices } from '@playwright/test'
import {
  getDummyServerPort,
  getTestServerPort,
} from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const PORT = await getTestServerPort(packageJson.name)
const START_PORT = await getTestServerPort(`${packageJson.name}_start`)
const EXTERNAL_PORT = await getDummyServerPort(packageJson.name)
const baseURL = `http://localhost:${PORT}`
const ssrModeCommand = `pnpm build && pnpm start`

export default defineConfig({
  testDir: '../basic-test-suite/src',
  workers: 1,
  reporter: [['line']],

  globalTeardown: '../basic-test-suite/src/setup/global.teardown.ts',

  use: {
    baseURL,
  },

  webServer: {
    command: `pnpm run test:e2e:startDummyServer && ${ssrModeCommand}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    env: {
      MODE: '',
      VITE_NODE_ENV: 'test',
      VITE_EXTERNAL_PORT: String(EXTERNAL_PORT),
      VITE_SERVER_PORT: String(PORT),
      START_PORT: String(START_PORT),
      PORT: String(PORT),
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
