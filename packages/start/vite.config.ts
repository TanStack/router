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
      './src/config.tsx',
      './src/router-manifest.tsx',
      './src/server-functions-client.tsx',
      './src/server-functions-server.tsx',
      './src/server-functions-ssr.tsx',
      './src/api.tsx',
    ],
    externalDeps: [
      '@tanstack/start-client',
      '@tanstack/start-server',
      '@tanstack/start-config',
      '@tanstack/start-router-manifest',
      '@tanstack/start-server-functions-client',
      '@tanstack/start-server-functions-server',
      '@tanstack/start-server-functions-ssr',
      '@tanstack/start-api-routes',
    ],
  }),
)
