import { configDefaults, defineConfig } from 'vitest/config'
import packageJson from './package.json'

export default defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
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
