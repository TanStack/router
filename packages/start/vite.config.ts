import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import react from '@vitejs/plugin-react'

const config = defineConfig({
  plugins: [react()],
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    externalDeps: ['@tanstack/start/router-manifest'],
    entry: [
      './src/client/index.tsx',
      './src/server/index.tsx',
      './src/client-runtime/index.tsx',
      './src/api/index.ts',
    ],
    srcDir: './src',
    exclude: ['./src/config'],
  }),
)
