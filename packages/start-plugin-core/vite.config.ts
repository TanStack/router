import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import type { TestProjectInlineConfiguration } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'
// Main's tests of features that are not compilers (Start manifest, sitemap,
// prerender, config schema, entries, build output, dev styles), at main's
// paths and unchanged but for this PR's additions to the prerender, Rsbuild
// build output and manifest tests: `test:noncompiler` runs them; the
// compiler test projects and ESLint leave them out. Paths relative to
// `tests/`.
import noncompilerTests from './tests/noncompiler-tests.json' with { type: 'json' }

/**
 * Slow-tier files whose tests run concurrently (project
 * `integration-concurrent`): each file builds its one app once, before its
 * tests (one `beforeAll`), and every test only reads that finished build:
 * it runs it in a page and an HTTP server of its own (a client run) or a
 * Node process of its own (an SSR run), and reads its files. No test
 * builds, edits a file, uses a dev or preview server, or reads what the
 * build or the process printed. A build changes process-wide state while
 * it runs (the working directory, `unhandledRejection` listeners,
 * `NODE_ENV`), so a file with sibling builds (`describe.each` over
 * bundlers, each with its `beforeAll`) is not one: its hooks would build at
 * once. Every other project runs one test at a time. Paths relative to
 * `tests/`; eslint.config.js reads the same list.
 */
import concurrentTests from './tests/concurrent-tests.json' with { type: 'json' }

/**
 * Slow-tier tests that read process-global state (the self-checks switch,
 * `TSR_COMPILER_VERIFY`, read once when the compiler loads; the compiler's
 * stats knob, `TSR_COMPILER_STATS`, in `perf-guards/`): each runs in a
 * process of its own (projects `integration-alone` and `perf-guards`), as a
 * state an earlier file left in a shared process would count too (Vite 8
 * keeps the plugins of every finished build and closed server, and so their
 * Start sessions, alive: Rolldown's native plugins hold Vite's callbacks
 * strongly, and those reach the plugins again).
 */
const aloneTests = [
  'integration/start-build-server-code-check-unchecked.test.ts',
  'integration/rsbuild/server-fn-resolver-repeat-unchecked.test.ts',
]

/**
 * Fast-tier tests that run in a process of their own (project `unit-alone`,
 * part of `test:unit`): an RSC host no other file shares.
 * `@vitejs/plugin-rsc` keeps the runner an SSR call reaches the provider
 * through in one process-global (`__VITE_ENVIRONMENT_RUNNER_IMPORT__`), set
 * by the last RSC dev server created: after a second RSC dev server of the
 * process closes, the shared RSC host's SSR cannot call its provider. Paths
 * relative to `tests/`.
 */
const unitAloneTests = ['start-compiler-rsc-import-protection.test.ts']

/** This package's build output (`dist`), as its `exports` name it. */
const builtPackage = new RegExp(
  `^${path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`,
)

/**
 * The slow-tier files the other platforms run (`test:integration:smoke`,
 * `.github/workflows/compiler-platforms.yml`): whole files, so a test
 * renamed inside one stays in the set. Paths relative to `tests/`; a file
 * renamed or deleted fails every Vitest run until this list names it again.
 */
const smokeTests = [
  'integration/importProtection/build.test.ts',
  'integration/start-compose-project-path.test.ts',
  'integration/start-build-unparsed-module.test.ts',
  // server fn ids and metadata on Windows paths (main's relative filename)
  'integration/start-build-server-fn-format.test.ts',
  // dev on macOS and Windows (phase 6 decision): a file removed and written
  // back on an Rsbuild dev server, and file events through Vite's dev
  // server (this list runs without a browser: the page test of the latter
  // is `start-dev-freshness-page.test.ts`)
  'integration/rsbuild/dev-file-back.test.ts',
  'integration/start-dev-freshness.test.ts',
]
if (process.env.VITEST) {
  const testsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'tests',
  )
  for (const [list, files] of Object.entries({
    smokeTests,
    concurrentTests,
  })) {
    for (const file of files) {
      if (!existsSync(path.join(testsDir, file))) {
        throw new Error(
          `vite.config.ts: the test file tests/${file} does not exist; update \`${list}\``,
        )
      }
    }
  }
}

/** The slow tier (`test:integration`): real builds, Rsbuild dev servers, child Node runs and browsers. */
const integrationProject = {
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
      'integration/perf-guards/**',
      ...aloneTests,
      ...concurrentTests,
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
} satisfies TestProjectInlineConfiguration

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
    // One test at a time in a file, whatever a row asks (`.concurrent`, a
    // `concurrent` option): a serial file's openers close with the current
    // test. `integration-concurrent` alone runs its files' tests at once.
    // (In the config: the CLI flag does not reach the projects.)
    maxConcurrency: 1,
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
        },
      },
      {
        // Fast tier (`test:unit`): compiles and evaluates in process; a Vite
        // dev server in middleware mode is allowed.
        extends: true,
        test: {
          name: 'unit',
          // A test process keeps its browser for later files
          isolate: false,
          exclude: [
            ...configDefaults.exclude,
            'integration/**',
            ...noncompilerTests,
            ...unitAloneTests,
          ],
        },
      },
      {
        // `unitAloneTests`, each file in a new process (`isolate: true`)
        extends: true,
        test: {
          name: 'unit-alone',
          include: unitAloneTests,
        },
      },
      integrationProject,
      {
        // Slow tier too (`test:integration`): `concurrentTests`, the tests of
        // a file at once, at most 4. `NODE_ENV` is `vite build`'s value
        // (`production`) for the whole run; a build holds its own mode's
        // value while it runs (`node-env`), and an SSR run passes its build's
        // mode to its process.
        ...integrationProject,
        test: {
          ...integrationProject.test,
          name: 'integration-concurrent',
          include: concurrentTests,
          exclude: [...configDefaults.exclude],
          sequence: { concurrent: true },
          maxConcurrency: 4,
          env: { NODE_ENV: 'production' },
        },
      },
      {
        // `smokeTests` alone, as the slow tier runs them
        ...integrationProject,
        test: {
          ...integrationProject.test,
          name: 'integration-smoke',
          include: smokeTests,
          exclude: [...configDefaults.exclude],
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
        // Work and memory guards (`test:integration` runs them; not oracle
        // tests: they count what the compiler does, plans, compiles and
        // resolutions, which a correct compiler need not match), each file
        // in a process of its own.
        extends: true,
        test: {
          name: 'perf-guards',
          include: ['integration/perf-guards/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          server: { deps: { external: [builtPackage] } },
        },
      },
      {
        // Slow tier too (`test:integration` runs both projects): `<Hydrate>`
        // cases rendered and hydrated in pages of the Start host
        // (`render.ts`), as the fast tier runs them, whose cost does not fit
        // the fast tier. Each case has its own directory of the file's host
        // (`start-host.ts`). A test process keeps its browser for later
        // files (`isolate: false`).
        extends: true,
        test: {
          name: 'integration-pages',
          include: ['integration/pages/**/*.test.ts'],
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
      './src/rsbuild/asset-query-loader.ts',
    ],
    srcDir: './src',
    outDir: './dist',
    cjs: false,
  }),
)
