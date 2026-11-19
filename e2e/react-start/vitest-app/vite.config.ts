import { defineConfig } from 'vitest/config'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'

// A Start app. The same config serves the app and its tests.
//
// `test:e2e` runs in a copy that is installed like a user's project
// (`test:e2e:installed`, `scripts/e2e/run-as-installed.md` says why that
// differs from a run here). The copy type-checks the project: the workspace
// installs `vitest` several times, once per set of peers, and the types Start
// adds to Vitest's test context reach only one of those copies. It then runs
// these tests twice: with an empty Vitest cache, and again with the compiled
// modules of the first run in the cache. A test run must not depend on the
// Start compiler having seen a file in the same process.
export default defineConfig({
  plugins: [tanstackStart(), react()],
  test: {
    watch: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/**/*.client.test.ts?(x)'],
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
          include: ['tests/**/*.client.test.ts?(x)'],
          setupFiles: ['tests/jsdom.setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          // Module mocks (`vi.mock`) of server functions, as an app writes
          // them without Start's testing helpers: the project runs tests in
          // Node, and a test file can switch to jsdom with a
          // `@vitest-environment` comment.
          name: 'module-mocks',
          environment: 'node',
          include: ['tests/module-mocks/**/*.test.ts?(x)'],
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
