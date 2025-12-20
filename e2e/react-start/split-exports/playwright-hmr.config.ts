import { defineConfig, devices } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

/**
 * Playwright configuration for HMR tests.
 *
 * This config runs the dev server instead of a production build,
 * allowing tests to verify Hot Module Replacement works correctly
 * with the split-exports plugin.
 *
 * Run with: npx playwright test --config=playwright-hmr.config.ts
 */

// Use a different port for HMR tests to avoid conflicts
const PORT = (await getTestServerPort(packageJson.name)) + 1
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  // Only run HMR test files
  testMatch: '*-hmr.spec.ts',
  // HMR tests can be slower due to file system operations
  timeout: 60000,
  // Run serially to avoid file system conflicts
  workers: 1,
  reporter: [['line']],

  use: {
    baseURL,
    // Longer timeouts for HMR operations
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  webServer: {
    // Use dev server instead of build
    command: `pnpm dev`,
    url: baseURL,
    // Always start fresh for HMR tests
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    // Dev server may take longer to start
    timeout: 60000,
    env: {
      PORT: String(PORT),
    },
  },

  projects: [
    {
      name: 'chromium-hmr',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
