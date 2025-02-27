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
      './src/plugin.ts',
      './src/router-manifest.tsx',
      './src/server-functions-client.tsx',
      './src/server-functions-server.tsx',
      './src/server-functions-ssr.tsx',
      './src/api.tsx',
    ],
    externalDeps: [
      '@tanstack/react-start-client',
      '@tanstack/react-start-server',
      '@tanstack/react-start-plugin',
      '@tanstack/react-start-router-manifest',
      '@tanstack/react-start-server-functions-client',
      '@tanstack/start-server-functions-server',
      '@tanstack/react-start-server-functions-ssr',
      '@tanstack/react-start-api-routes',
    ],
  }),
)
