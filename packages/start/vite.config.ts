import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import react from '@vitejs/plugin-react'
import type { UserConfig } from 'vitest/config'

const config = defineConfig({
  plugins: [react()] as UserConfig['plugins'],
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
      './src/server-runtime/index.tsx',
      './src/react-server-runtime/index.tsx',
      './src/server-handler/index.tsx',
    ],
    srcDir: './src',
    exclude: ['./src/config'],
  }),
)
