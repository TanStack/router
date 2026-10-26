import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'
// Main's tests of features that are not compilers (Start manifest, sitemap,
// prerender, config schema, entries, build output, dev styles), at main's
// paths and unchanged: `test:noncompiler` runs them; the compiler test
// projects and ESLint leave them out. Paths relative to `tests/`.
import noncompilerTests from './tests/noncompiler-tests.json' with { type: 'json' }

// Under Vitest: Node's compile cache for the test workers and the child
// Node runs they start (the harness passes this environment on). No outcome
// change; less time compiling the bundlers, jsdom and the built apps again.
if (process.env.VITEST) {
  process.env.NODE_COMPILE_CACHE ??= path.join(
    os.tmpdir(),
    'node-compile-cache',
  )
}

/**
 * Slow-tier tests that read process-global state (the compiler's stats knob,
 * `TSR_COMPILER_STATS`): each runs in a process of its own (project
 * `integration-alone`), as a state an earlier file left in a shared process
 * would count too (Rspack keeps a closed compiler's last compilation, and
 * so its Start session, alive).
 */
const aloneTests = ['integration/start-build-environment-release.test.ts']

/** This package's build output (`dist`), as its `exports` name it. */
const builtPackage = new RegExp(
  `^${path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`,
)

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    // At most 4 test processes per Vitest run (measured), fewer on a small
    // machine (half its logical CPUs, at least one): each runs real bundlers,
    // dev servers and its own browser. Nx runs this tier alone on its machine
    // (`parallelism: false` in package.json), but more workers still add swap
    // and load flakes, not speed, and on a CI agent with 2 or 4 CPUs four of
    // them time out. `--maxWorkers` on the command line still overrides it.
    maxWorkers: Math.min(
      4,
      Math.max(1, Math.floor(os.availableParallelism() / 2)),
    ),
    reporters: ['default', '@tanstack/compiler-test-utils/budget-reporter'],
    globalSetup: ['@tanstack/compiler-test-utils/run-directory'],
    setupFiles: [
      '@tanstack/compiler-test-utils/test-scope-setup',
      '@tanstack/compiler-test-utils/pins-setup',
    ],
    projects: [
      {
        extends: true,
        test: {
          name: 'noncompiler',
          include: noncompilerTests,
          typecheck: { enabled: true },
        },
      },
      {
        // Fast tier (`test:unit`): compiles and evaluates in process; a Vite
        // dev server in middleware mode is allowed.
        extends: true,
        test: {
          name: 'unit',
          // A test process keeps its browser and the hosts a file gives
          // back for later files (`useStartHost`; see `start-host.ts`)
          isolate: false,
          exclude: [
            ...configDefaults.exclude,
            'integration/**',
            ...noncompilerTests,
          ],
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
          exclude: [
            ...configDefaults.exclude,
            'integration/pages/**',
            ...aloneTests,
          ],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // The tests import this package's built public entries
          // (`@tanstack/start-plugin-core/vite`, `/rsbuild`): Node loads
          // them, as it loads an installed package, so the plugin and the
          // loaders Rspack loads from the same `dist` share one module
          // instance.
          server: { deps: { external: [builtPackage] } },
        },
      },
      {
        // Slow tier too (`test:integration` runs it): `aloneTests`, each
        // file in a new process (`isolate: true`).
        extends: true,
        test: {
          name: 'integration-alone',
          include: aloneTests,
          testTimeout: 30_000,
          hookTimeout: 30_000,
          server: { deps: { external: [builtPackage] } },
        },
      },
      {
        // Slow tier too (`test:integration` runs both projects): `<Hydrate>`
        // cases rendered and hydrated in pages of the Start host
        // (`render.ts`), as the fast tier runs them, whose cost does not fit
        // the fast tier's budget. The tests of a file run concurrently: each
        // case has its own directory of the file's host, and each page run
        // holds one of the host's pages alone (`start-host.ts`). A test
        // process keeps its browser and the hosts a file gives back for
        // later files (`isolate: false`).
        extends: true,
        test: {
          name: 'integration-pages',
          include: ['integration/pages/**/*.test.ts'],
          sequence: { concurrent: true },
          isolate: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
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
      './src/utils.ts',
      './src/vite/index.ts',
      './src/rsbuild/index.ts',
      './src/rsbuild/types.ts',
      './src/rsbuild/compiler-loader.ts',
    ],
    srcDir: './src',
    outDir: './dist',
    cjs: false,
  }),
)
