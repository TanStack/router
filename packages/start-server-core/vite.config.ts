import path from 'node:path'
import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import packageJson from './package.json'
// this needs to be imported from the actual file instead of from 'index.tsx'
// so we don't trigger the import of a `?script-string` import before the minifyScriptPlugin is setup
import { VIRTUAL_MODULES } from './src/virtual-modules'

const config = defineConfig({
  test: {
    include: ['**/*.{test-d,test,spec}.?(c|m)[jt]s?(x)'],
    name: packageJson.name,
    watch: false,
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '#tanstack-router-entry': path.resolve(__dirname, './tests/mocks/router-entry.ts'),
      '#tanstack-start-entry': path.resolve(__dirname, './tests/mocks/start-entry.ts'),
      'tanstack-start-manifest:v': path.resolve(__dirname, './tests/mocks/start-manifest.ts'),
      'tanstack-start-injected-head-scripts:v': path.resolve(__dirname, './tests/mocks/injected-head-scripts.ts'),

    }
  }
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    srcDir: './src',
    entry: [
      './src/index.tsx',
      './src/createServerRpc.ts',
      './src/createSsrRpc.ts',
      './src/fake-start-server-fn-manifest.ts',
    ],
    externalDeps: [
      ...Object.values(VIRTUAL_MODULES),
      '#tanstack-start-entry',
      '#tanstack-router-entry',
      '#tanstack-start-server-fn-manifest',
    ],
    cjs: false,
  }),
)
