import path from 'node:path'
import os from 'node:os'
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import react from '@vitejs/plugin-react'
import { copyFilesPlugin } from '@tanstack/router-utils'
import packageJson from './package.json'

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
    projects: [
      {
        // Fast tier (`test:unit`): the runtime's unit tests (jsdom) and the
        // in-process compiler tests.
        extends: true,
        test: {
          name: 'unit',
          include: ['**/*.{test-d,test,spec}.?(c|m)[jt]s?(x)'],
          exclude: [...configDefaults.exclude, 'tests/integration/**'],
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
