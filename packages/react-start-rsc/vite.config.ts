import path from 'node:path'
import os from 'node:os'
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import react from '@vitejs/plugin-react'
import { copyFilesPlugin } from '@tanstack/router-utils'
import packageJson from './package.json'
// Main's runtime tests (RSC components, streams, the proxy, and the types of
// the public API), at main's paths and unchanged: `test:noncompiler` runs
// them; the compiler projects leave them out. Paths relative to `tests/`.
import noncompilerTests from './tests/noncompiler-tests.json' with { type: 'json' }

// Under Vitest: Node's compile cache for the test workers. No outcome
// change; less time compiling the bundlers and the built apps again.
if (process.env.VITEST) {
  process.env.NODE_COMPILE_CACHE ??= path.join(
    os.tmpdir(),
    'node-compile-cache',
  )
}

const config = defineConfig({
  resolve: {
    alias: {
      'virtual:tanstack-rsc-browser-decode': '@vitejs/plugin-rsc/browser',
    },
  },
  plugins: [
    react(),
    copyFilesPlugin({
      pattern: ['*.ts', '*.tsx', '!*.d.ts'],
      fromDir: 'src/entry',
      toDir: 'dist/plugin/entry',
    }),
  ],
  test: {
    name: packageJson.name,
    watch: false,
    reporters: ['default', '@tanstack/compiler-test-utils/budget-reporter'],
    globalSetup: ['@tanstack/compiler-test-utils/run-directory'],
    projects: [
      {
        // Fast compiler acceptance tier; real apps run in integration.
        // Runtime coverage is selected by test:noncompiler below.
        extends: true,
        test: {
          name: 'unit',
          include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
          exclude: [
            ...configDefaults.exclude,
            'tests/integration/**',
            ...noncompilerTests.map((file) => `tests/${file}`),
          ],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'noncompiler',
          dir: './tests',
          include: noncompilerTests,
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        // Slow tier (`test:integration`): real Start apps with RSC on Vite
        // and Rsbuild dev servers and builds, and real browser pages. Its
        // Nx target builds `@tanstack/react-start` first.
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts?(x)'],
          environment: 'node',
          // The dev servers and their module runners run in the test
          // process, and `vite dev` runs with `development`: Vitest's `test`
          // would be baked into the served client code (e.g. the RSC HMR
          // client is set up under `development` only).
          env: { NODE_ENV: 'development' },
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    srcDir: './src',
    entry: [
      './src/index.ts',
      './src/index.rsc.ts',
      './src/serialization.client.ts',
      './src/serialization.server.ts',
      './src/plugin/rscCssTransform.ts',
      './src/plugin/vite.ts',
      './src/entry/rsc.tsx',
      './src/rsbuild/ssr-decode.ts',
      './src/rsbuild/browser-decode.ts',
    ],
    cjs: false,
    // Externalize virtual modules and SSR-only imports - resolved at runtime by Vite plugins
    externalDeps: [
      'virtual:tanstack-rsc-runtime',
      'virtual:tanstack-rsc-browser-decode',
      'virtual:tanstack-rsc-ssr-decode',
      'virtual:tanstack-rsc-hmr',
      '#tanstack-start-server-fn-resolver',
      'react-server-dom-rspack/client.node',
      'react-server-dom-rspack/client.browser',
      'react-server-dom-rspack/server',
    ],
  }),
)
