import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'
import type { ViteUserConfig } from 'vitest/config'

const config = defineConfig({
  plugins: [react()] as ViteUserConfig['plugins'],
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    typecheck: { enabled: true },
    setupFiles: ['./tests/setupTests.tsx'],
  },
  resolve: {
    // this is necessary so that @tanstack/router-is-server resolves to `isServer: false`
    // for some server side tests we mock this package to get `isServer: true`
    conditions: ['browser'],
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: ['./src/index.tsx', './src/ssr/client.ts', './src/ssr/server.ts'],
    srcDir: './src',
  }),
)
