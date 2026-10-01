import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'
import { ssrStylesMode, useNitro, viteBundledDev } from './env'

const mode = process.env.MODE ?? 'prod'
const isDev = mode === 'dev'

// Build a unique port key per dimension combination (ssrStyles mode + nitro)
// e.g. "...dev-ssr-styles", "...dev-ssr-styles-disabled", "...dev-ssr-styles-nitro",
//      "...dev-ssr-styles-disabled-nitro"

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const baseURL = `http://localhost:${PORT}`

// Select the appropriate dev command based on SSR_STYLES + VITE_USE_NITRO
function getDevCommand() {
  const scriptParts = ['dev:e2e']
  if (ssrStylesMode !== 'default') {
    scriptParts.push(ssrStylesMode)
  }
  if (useNitro) {
    scriptParts.push('nitro')
  }
  return `pnpm ${scriptParts.join(':')}`
}

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],

  globalSetup: './tests/setup/global.setup.ts',

  use: {
    baseURL,
  },

  webServer: {
    command: isDev ? getDevCommand() : `pnpm build && PORT=${PORT} pnpm start`,
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      VITE_NODE_ENV: 'test',
      PORT: String(PORT),
      E2E_VITE_BUNDLED_DEV: String(viteBundledDev),
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
