import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'
import type { ViteUserConfig } from 'vitest/config'

const config = defineConfig({
  plugins: [react()] as ViteUserConfig['plugins'],
  test: {
    name: packageJson.name,
    watch: false,
    environment: 'jsdom',
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    externalDeps: ['@tanstack/start/router-manifest', 'tsr:server-fn-manifest'],
    entry: [
      './src/client/index.tsx',
      './src/server/index.tsx',
      './src/api/index.ts',
      './src/client-runtime/index.tsx',
      './src/server-runtime/index.tsx',
      './src/ssr-runtime/index.tsx',
      './src/server-handler/index.tsx',
    ],
    srcDir: './src',
    exclude: ['./src/config'],
  }),
)
