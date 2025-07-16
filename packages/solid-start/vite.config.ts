import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import packageJson from './package.json'

const config = defineConfig({
  test: {
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
      './src/client.tsx',
      './src/server.tsx',
      './src/plugin-vite.ts',
      './src/server-functions-client.tsx',
      './src/server-functions-server.tsx',
    ],
    externalDeps: [
      '@tanstack/solid-start-client',
      '@tanstack/solid-start-server',
      '@tanstack/solid-start-plugin',
      '@tanstack/start-server-functions-client',
      '@tanstack/start-server-functions-server',
    ],
  }),
)
