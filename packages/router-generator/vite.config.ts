import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    reporters: ['default', '@tanstack/compiler-test-utils/budget-reporter'],
    // Test files share a worker's modules (the router packages, Vite): every
    // test works in its own temporary app and restores its spies and env
    // stubs, and the route tree helpers start a fresh Vite server per load.
    isolate: false,
    projects: [
      {
        // Fast tier (`test:unit`): generator runs, route trees loaded by the
        // real router in a Vite server in middleware mode, small type checks.
        extends: true,
        test: {
          name: 'unit',
          exclude: [...configDefaults.exclude, 'integration/**'],
          typecheck: { enabled: true },
        },
      },
      {
        // Slow tier (`test:integration`): one TypeScript program per
        // generated route tree (the trees augment the router's types
        // globally, so they cannot share one).
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

export default mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    entry: './src/index.ts',
    srcDir: './src',
  }),
)
