import path from 'node:path'
import os from 'node:os'
import { configDefaults, defineConfig } from 'vitest/config'
import packageJson from './package.json'

// Under Vitest: Node's compile cache for the test workers and the child
// Node runs they start (the harness passes this environment on). No outcome
// change; less time compiling the bundlers, jsdom and the built apps again.
if (process.env.VITEST) {
  process.env.NODE_COMPILE_CACHE ??= path.join(
    os.tmpdir(),
    'node-compile-cache',
  )
}

export default defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    // At most 4 test processes per Vitest run (PERF-STUDY 2026-10-23): each
    // runs real bundlers, dev servers and its own browser, and Nx runs several
    // packages' tiers at once. More workers add swap and load flakes, not
    // speed. `--maxWorkers` on the command line still overrides it.
    maxWorkers: 4,
    reporters: ['default', '@tanstack/compiler-test-utils/budget-reporter'],
    globalSetup: ['./src/run-directory.ts'],
    projects: [
      {
        // Fast tier (`test:unit`): in process; a Vite dev server in
        // middleware mode is allowed.
        extends: true,
        test: {
          name: 'unit',
          exclude: [...configDefaults.exclude, 'integration/**'],
        },
      },
      {
        // Slow tier (`test:integration`): the harness self-tests that run
        // real builds, Rsbuild dev servers, child Node runs and browsers.
        extends: true,
        test: {
          name: 'integration',
          include: ['integration/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
