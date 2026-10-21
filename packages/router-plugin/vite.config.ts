import path from 'node:path'
import os from 'node:os'
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
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

/**
 * Implementation tests: outside the compiler test corpus (see
 * packages/compiler-test-utils/AGENTS.md, "Corpus and implementation tests").
 */
const implementationTests = '**/outside-compiler-corpus/**'

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    reporters: ['default', '@tanstack/compiler-test-utils/budget-reporter'],
    globalSetup: ['./tests/generator-tmp-dir.ts'],
    projects: [
      {
        // Fast tier (`test:unit`): compiles and evaluates in process; a Vite
        // dev server in middleware mode is allowed.
        extends: true,
        test: {
          name: 'unit',
          exclude: [
            ...configDefaults.exclude,
            'integration/**',
            implementationTests,
          ],
          typecheck: { enabled: true },
          // Client checks run in a real browser page: the first run on a
          // new dev server (dependency pre-bundling) takes seconds under load
          testTimeout: 30_000,
        },
      },
      {
        // Slow tier (`test:integration`): real builds, Rsbuild dev servers,
        // child Node runs and browsers.
        extends: true,
        test: {
          name: 'integration',
          include: ['integration/**/*.test.ts'],
          exclude: [...configDefaults.exclude, implementationTests],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        // Implementation tests (`test:implementation`, both tiers): files
        // under an `outside-compiler-corpus/` directory. They pin choices of
        // today's implementation that a correct compiler may make
        // differently, so the corpus targets above leave them out (see
        // packages/compiler-test-utils/AGENTS.md).
        extends: true,
        test: {
          name: 'implementation',
          include: ['**/outside-compiler-corpus/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'integration/**'],
          typecheck: { enabled: true },
        },
      },
      {
        extends: true,
        test: {
          name: 'implementation-integration',
          include: ['integration/**/outside-compiler-corpus/**/*.test.ts'],
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
