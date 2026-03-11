import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    typecheck: { enabled: true },
    name: packageJson.name,
    watch: false,
    environment: 'jsdom',
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    srcDir: './src',
    entry: [
      './src/index.tsx',
      './src/fake-start-entry.ts',
      './src/client/index.ts',
      './src/client-rpc/index.ts',
    ],
    cjs: false,
    externalDeps: ['#tanstack-start-entry', '#tanstack-router-entry'],
  }),
)
