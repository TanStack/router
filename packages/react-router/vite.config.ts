import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'

const isTest =
  process.env.VITEST ||
  process.env.NODE_TEST_CONTEXT ||
  process.env.NODE_ENV === 'test'

const config = defineConfig({
  plugins: [react()],
  // Add 'development' condition for tests to resolve @tanstack/router-core/isServer
  // to the development export (isServer = undefined) instead of node (isServer = true)
  ...(isTest && {
    resolve: {
      conditions: ['development'],
    },
  }),
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    typecheck: { enabled: true },
    setupFiles: ['./tests/setupTests.tsx'],
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: [
      './src/index.tsx',
      './src/index.dev.tsx',
      './src/ssr/client.ts',
      './src/ssr/server.ts',
    ],
    srcDir: './src',
  }),
)
