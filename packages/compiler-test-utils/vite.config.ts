import { configDefaults, defineConfig } from 'vitest/config'
import packageJson from './package.json'

export default defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    // At most 4 test processes per Vitest run: each
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
