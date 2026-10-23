import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

// Under Vitest: no file cache of jiti, which loads the route configuration
// files of the apps for the generator (virtual route configs). Its cache is
// the `node_modules/.cache` of the working directory: this package's. No
// outcome change.
if (process.env.VITEST) {
  process.env.JITI_FS_CACHE ??= 'false'
}

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    reporters: ['default', '@tanstack/compiler-test-utils/budget-reporter'],
    globalSetup: ['@tanstack/compiler-test-utils/run-directory'],
    // Test files share a worker's modules (the router packages, Vite): every
    // test works in its own temporary app and restores its spies and env
    // stubs, and the route tree helpers share Vite servers only where they
    // forget the app's modules first.
    isolate: false,
    projects: [
      {
        // Fast tier (`test:unit`): generator runs, route trees loaded by the
        // real router in a Vite server in middleware mode, small type checks.
        extends: true,
        test: {
          name: 'unit',
          exclude: [...configDefaults.exclude, 'integration/**'],
        },
      },
      {
        // Fast tier, after `unit` (`test:unit`): the type tests of the
        // route trees the `unit` run generated (tests/generator/**/*.test-d.ts).
        // One Vitest run selects both projects (so command-line options such
        // as `--maxWorkers` reach both): Vitest runs type tests in a group of
        // their own, after the groups of the runtime tests.
        extends: true,
        test: {
          name: 'types',
          include: [],
          typecheck: {
            enabled: true,
            only: true,
            include: ['generator/nested/tests.test-d.ts'],
            tsconfig: './tests/tsconfig.acceptance.json',
          },
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
          typecheck: { enabled: false },
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
