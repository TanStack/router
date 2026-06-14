import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const e2ePortKey = process.env.E2E_PORT_KEY ?? packageJson.name
const toolchain = process.env.E2E_TOOLCHAIN ?? 'vite'
const distDir = process.env.E2E_DIST_DIR ?? 'dist'
const serverEntry = process.env.TSS_E2E_SERVER_ENTRY ?? ''
const serverEntryMode = serverEntry ? 'custom' : 'default'

export const PORT = await getTestServerPort(`${e2ePortKey}-${serverEntryMode}`)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL,
  },
  webServer: {
    command: `pnpm start`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    env: {
      PORT: String(PORT),
      VITE_SERVER_PORT: String(PORT),
      E2E_DIST_DIR: distDir,
      E2E_TOOLCHAIN: toolchain,
      E2E_PORT_KEY: e2ePortKey,
      TSS_E2E_SERVER_ENTRY: serverEntry,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
