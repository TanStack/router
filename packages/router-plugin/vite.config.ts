import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import type { TestProjectInlineConfiguration } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'
import {
  concurrentTests,
  moreConcurrentTests,
  serialHmrTests,
} from './concurrent-tests.js'

const testsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'tests',
)

/**
 * The slow-tier files the other platforms run (`test:integration:smoke`,
 * `.github/workflows/compiler-platforms.yml`): whole files, so a test
 * renamed inside one stays in the set. Paths relative to `tests/`; a file
 * renamed or deleted fails every Vitest run until this list names it again.
 */
const smokeTests = [
  'integration/build-production.test.ts',
  'integration/code-splitter-project-path.test.ts',
  'integration/code-splitter-unparsed-route.test.ts',
  'integration/code-splitter-robustness.test.ts',
  'integration/split-module-ids.test.ts',
]
if (process.env.VITEST) {
  for (const [list, files] of Object.entries({
    smokeTests,
    serialHmrTests,
    moreConcurrentTests,
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
      ...concurrentTests,
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
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
    reporters: ['default', '@tanstack/compiler-test-utils/budget-reporter'],
    globalSetup: ['@tanstack/compiler-test-utils/run-directory'],
    setupFiles: [
      '@tanstack/compiler-test-utils/test-scope-setup',
      '@tanstack/compiler-test-utils/pins-setup',
      './tests/route-hosts-setup.ts',
    ],
    projects: [
      {
        // Fast tier (`test:unit`): compiles in process; client checks run in
        // pages of a real browser (`route-app.ts`). A test process keeps its
        // browser across test files (`isolate: false`).
        extends: true,
        test: {
          name: 'unit',
          isolate: false,
          exclude: [...configDefaults.exclude, 'integration/**'],
          // Client checks run in a real browser page: the first run on a new
          // dev server (dependency pre-bundling) takes seconds under load
          testTimeout: 30_000,
        },
      },
      integrationProject,
      {
        // Slow tier too (`test:integration`): `concurrentTests`, the tests of
        // a file at once, at most 4; `NODE_ENV` is the dev servers' value
        // (`vite dev`, `rsbuild dev`) for the whole run.
        ...integrationProject,
        test: {
          ...integrationProject.test,
          name: 'integration-concurrent',
          include: concurrentTests,
          exclude: [...configDefaults.exclude],
          sequence: { concurrent: true },
          maxConcurrency: 4,
          env: { NODE_ENV: 'development' },
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
        // Work and memory guards (`test:integration` runs them; not oracle
        // tests: they count what the compiler keeps alive through the stats
        // knob, process-wide, which a correct compiler need not match), each
        // file in a process of its own.
        extends: true,
        test: {
          name: 'perf-guards',
          include: ['integration/perf-guards/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        // Slow tier too (`test:integration`): route apps checked in pages of
        // a real browser (`route-app.ts`), as the fast tier checks them,
        // whose cost does not fit the fast tier.
        ...integrationProject,
        test: {
          ...integrationProject.test,
          name: 'integration-pages',
          include: ['integration/pages/**/*.test.ts'],
          exclude: [...configDefaults.exclude],
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
      './src/planners/index.ts',
    ],
    srcDir: './src',
  }),
)
