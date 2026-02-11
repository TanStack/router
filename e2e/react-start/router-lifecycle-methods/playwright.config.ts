import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import { dehydrateDefaultsMode } from './tests/utils/dehydrateDefaults'
import packageJson from './package.json' with { type: 'json' }

const PORT = await getTestServerPort(
  `${packageJson.name}${dehydrateDefaultsMode ? `_${dehydrateDefaultsMode}` : ''}`,
)
const baseURL = `http://localhost:${PORT}`

console.log(
  'running with DEHYDRATE_DEFAULTS:',
  dehydrateDefaultsMode || '(builtin defaults)',
)

export default defineConfig({
  testDir: './tests',
  workers: 1,

  reporter: [['line']],

  use: {
    baseURL,
  },

  webServer: {
    command: `VITE_SERVER_PORT=${PORT} VITE_DEHYDRATE_DEFAULTS=${dehydrateDefaultsMode} pnpm build && NODE_ENV=production PORT=${PORT} VITE_SERVER_PORT=${PORT} VITE_DEHYDRATE_DEFAULTS=${dehydrateDefaultsMode} pnpm start`,
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
