import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'

const config = defineConfig({
  plugins: [react()],
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
    typecheck: { enabled: true },
    setupFiles: ['./tests/jest-dom.setup.ts', './tests/setupTests.tsx'],
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    entry: [
      './src/index.tsx',
      './src/route-module-internal.ts',
      './src/index.rsc.ts',
      './src/index.dev.tsx',
      './src/ssr/client.ts',
      './src/ssr/server.ts',
    ],
    srcDir: './src',
  }),
)
