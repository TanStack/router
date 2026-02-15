import { defineConfig, mergeConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import { tanstackViteConfig } from '@tanstack/config/vite'
import packageJson from './package.json'

const config = defineConfig({
  plugins: [preact()],
  // Add 'development' condition for tests to resolve @tanstack/router-core/isServer
  // to the development export (isServer = undefined) instead of node (isServer = true)
  ...(process.env.VITEST && {
    resolve: {
      conditions: ['development'],
    },
  }),
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    setupFiles: ['./tests/setupTests.tsx'],
    typecheck: { enabled: true },
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: [
      './src/index.tsx',
      './src/index.dev.tsx',
    ],
    srcDir: './src',
    cjs: false,
  }),
)
