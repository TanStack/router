import path from 'node:path'
import os from 'node:os'
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

// Under Vitest: Node's compile cache for the test workers and the child
// Node runs they start (the harness passes this environment on). No outcome
// change; less time compiling the bundlers and the built apps again.
if (process.env.VITEST) {
  process.env.NODE_COMPILE_CACHE ??= path.join(
    os.tmpdir(),
    'node-compile-cache',
  )
}

/**
 * The projects whose tests check route apps in pages of a real browser
 * (`tests/route-app.ts`): the tests of a file run concurrently, each on dev
 * servers it holds alone (a test leases a host of the test process; a
 * concurrent test of the same configuration gets another one) and on pages
 * of the process's bounded page pool (`@tanstack/compiler-test-utils/
 * browser`). A test process keeps its browser and its free hosts across
 * test files (`isolate: false`): a file starts only the hosts no earlier
 * file left free. Both are bounded (FINAL-PASS #40).
 */
const pagesProject = {
  extends: true,
  test: {
    sequence: { concurrent: true },
    isolate: false,
    // Client checks run in a real browser page: the first run on a new dev
    // server (dependency pre-bundling) takes seconds under load
    testTimeout: 30_000,
  },
} as const

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    reporters: ['default', '@tanstack/compiler-test-utils/budget-reporter'],
    globalSetup: ['@tanstack/compiler-test-utils/run-directory'],
    setupFiles: ['@tanstack/compiler-test-utils/test-scope-setup'],
    projects: [
      {
        // Fast tier (`test:unit`): compiles in process; client checks run in
        // pages of a real browser (see `pagesProject`).
        ...pagesProject,
        test: {
          ...pagesProject.test,
          name: 'unit',
          exclude: [...configDefaults.exclude, 'integration/**'],
          typecheck: { enabled: true },
        },
      },
      {
        // Slow tier (`test:integration`): real builds, Rsbuild dev servers,
        // child Node runs and browsers.
        extends: true,
        test: {
          name: 'integration',
          // A test process keeps its modules (and its browser) across test
          // files; the setup file gives each file the environment it
          // started with (see `test-scope-setup`)
          isolate: false,
          include: ['integration/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'integration/pages/**'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        // Slow tier too (`test:integration` runs both projects): route apps
        // checked in pages of a real browser (`route-app.ts`), as the fast
        // tier checks them, whose cost does not fit the fast tier's budget.
        ...pagesProject,
        test: {
          ...pagesProject.test,
          name: 'integration-pages',
          include: ['integration/pages/**/*.test.ts'],
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
    entry: [
      './src/index.ts',
      './src/context.ts',
      './src/vite.ts',
      './src/rspack.ts',
      './src/webpack.ts',
      './src/esbuild.ts',
    ],
    srcDir: './src',
  }),
)
