import { defineConfig, devices } from '@playwright/test'
import {
  getDummyServerPort,
  getTestServerPort,
} from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }
import { isPrerender } from './tests/utils/isPrerender'

const PORT = await getTestServerPort(packageJson.name)
const START_PORT = await getTestServerPort(packageJson.name)
const EXTERNAL_PORT = await getDummyServerPort(packageJson.name)
const baseURL = `http://localhost:${PORT}/custom/basepath`

const ssrModeCommand = `pnpm build && pnpm start`
const prerenderModeCommand = `pnpm run test:e2e:startDummyServer && pnpm build:prerender && pnpm run test:e2e:stopDummyServer && pnpm start`
const prerenderTrailingModeCommand = `pnpm run test:e2e:startDummyServer && pnpm build:prerender:trailing && pnpm run test:e2e:stopDummyServer && pnpm start`
const isTrailingSlashPrerender =
  process.env.TRAILING_SLASH?.toLowerCase() === 'true'

const getCommand = () => {
  if (isPrerender && isTrailingSlashPrerender)
    return prerenderTrailingModeCommand
  if (isPrerender) return prerenderModeCommand
  return ssrModeCommand
}

console.log(
  'running in prerender mode: ',
  isPrerender.toString(),
  isPrerender
    ? isTrailingSlashPrerender
      ? 'with trailing slash'
      : 'without trailing slash'
    : '',
)

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  workers: 1,

  reporter: [['line']],

  globalSetup: './tests/setup/global.setup.ts',
  globalTeardown: './tests/setup/global.teardown.ts',

  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,
  },

  webServer: {
    command: getCommand(),
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    env: {
      MODE: process.env.MODE || '',
      TRAILING_SLASH: isTrailingSlashPrerender.toString(),
      VITE_TRAILING_SLASH: isTrailingSlashPrerender.toString(),
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
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
