import { defineConfig, devices } from '@playwright/test'

const port = Number.parseInt(
  process.env.MEMORY_BENCH_REACT_CLIENT_PORT ?? '42101',
  10,
)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  workers: 1,
  reporter: [['line']],
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      NODE_ENV: 'production',
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
