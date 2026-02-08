import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import { serializeDefaultsMode } from './tests/utils/serializeDefaults'
import packageJson from './package.json' with { type: 'json' }

const PORT = await getTestServerPort(
  `${packageJson.name}${serializeDefaultsMode ? `_${serializeDefaultsMode}` : ''}`,
)
const baseURL = `http://localhost:${PORT}`

console.log(
  'running with SERIALIZE_DEFAULTS:',
  serializeDefaultsMode || '(builtin defaults)',
)

export default defineConfig({
  testDir: './tests',
  workers: 1,

  reporter: [['line']],

  use: {
    baseURL,
  },

  webServer: {
    command: `VITE_SERVER_PORT=${PORT} VITE_SERIALIZE_DEFAULTS=${serializeDefaultsMode} pnpm build && NODE_ENV=production PORT=${PORT} VITE_SERVER_PORT=${PORT} VITE_SERIALIZE_DEFAULTS=${serializeDefaultsMode} pnpm start`,
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
