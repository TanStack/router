import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const PORT = await getTestServerPort(packageJson.name)
const baseURL = `http://localhost:${PORT}`
const nitroVariant = process.env.NITRO_VARIANT
if (nitroVariant !== 'v2' && nitroVariant !== 'v3') {
  throw new Error('Set NITRO_VARIANT to "v2" or "v3" for Nitro e2e tests.')
}
const buildScript = nitroVariant === 'v2' ? 'build:v2' : 'build:v3'
const buildCommand = `pnpm run ${buildScript}`

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  workers: 1,

  reporter: [['line']],

  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,
  },

  webServer: {
    // Note: We run node directly instead of vite preview because Nitro's
    // configurePreviewServer spawns on a random port. The prerendering during
    // build uses vite.preview() correctly.
    command: `${buildCommand} && PORT=${PORT} node .output/server/index.mjs`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
