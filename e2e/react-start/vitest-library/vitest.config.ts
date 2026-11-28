import { defineConfig } from 'vitest/config'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'

// A package without routes and without a router entry, which depends on
// Start only. It needs the Start compiler, so that each test environment gets
// the code a Start app would run there.
//
// `test:e2e` type-checks the project here and runs these tests in a copy that
// is installed like a user's project (`test:e2e:installed`,
// `scripts/e2e/run-as-installed.md` says why that differs from a run here).
// The copy runs them twice: with an empty Vitest cache, and again with the
// compiled modules of the first run in the cache. A test run must not depend
// on the Start compiler having seen a file in the same process.
export default defineConfig({
  plugins: [tanstackStart(), react()],
  test: {
    watch: false,
    // Vitest keeps the modules it compiled in one cache for the whole
    // repository. This project keeps its own, so that `vitest --clearCache`
    // in this directory empties only this one.
    fsModuleCachePath: 'node_modules/.vitest-cache',
    projects: [
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/**/*.client.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/**/*.client.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.server.test.ts'],
        },
      },
    ],
  },
})
