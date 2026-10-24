import { defineConfig, devices } from '@playwright/test'
import { appServerReady } from '@tanstack/router-e2e-utils'

const toolchain = process.env.E2E_TOOLCHAIN ?? 'vite'
const distDir = process.env.E2E_DIST_DIR ?? 'dist'
const serverEntry = process.env.TSS_E2E_SERVER_ENTRY ?? ''

export const PORT = Number(process.env.E2E_APP_PORT ?? 0)
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
    wait: appServerReady,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      PORT: String(PORT),
      VITE_SERVER_PORT: String(PORT),
      E2E_DIST_DIR: distDir,
      E2E_TOOLCHAIN: toolchain,
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
