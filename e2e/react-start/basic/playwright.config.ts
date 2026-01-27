import { defineConfig, devices } from '@playwright/test'
import {
  getDummyServerPort,
  getTestServerPort,
} from '@tanstack/router-e2e-utils'
import { isSpaMode } from './tests/utils/isSpaMode'
import { isPrerender } from './tests/utils/isPrerender'
import { isPreview } from './tests/utils/isPreview'
import packageJson from './package.json' with { type: 'json' }

const PORT = await getTestServerPort(
  `${packageJson.name}${isSpaMode ? '_spa' : ''}${isPreview ? '_preview' : ''}`,
)
const START_PORT = await getTestServerPort(
  `${packageJson.name}${isSpaMode ? '_spa_start' : ''}`,
)
const EXTERNAL_PORT = await getDummyServerPort(packageJson.name)
const baseURL = `http://localhost:${PORT}`
const spaModeCommand = `pnpm build:spa && pnpm start`
const ssrModeCommand = `pnpm build && pnpm start`
const prerenderModeCommand = `pnpm run test:e2e:startDummyServer && pnpm build:prerender && pnpm run test:e2e:stopDummyServer && pnpm start`
const previewModeCommand = `pnpm build && pnpm preview --port ${PORT}`

const getCommand = () => {
  if (isSpaMode) return spaModeCommand
  if (isPrerender) return prerenderModeCommand
  if (isPreview) return previewModeCommand
  return ssrModeCommand
}
console.log('running in spa mode: ', isSpaMode.toString())
console.log('running in prerender mode: ', isPrerender.toString())
console.log('running in preview mode: ', isPreview.toString())
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
