import fs from 'fs'
import path from 'path'
import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import replace from '@rollup/plugin-replace'
import react from '@vitejs/plugin-react'

const config = defineConfig({
  plugins: [
    // @ts-ignore
    react(),
  ],
})

export default mergeConfig(
  // @ts-ignore
  config,
  tanstackViteConfig({
    externalDeps: ['@tanstack/start/router-manifest'],
    entry: [
      './src/client/index.tsx',
      './src/server/index.tsx',
      './src/client-runtime/index.tsx',
    ],
    srcDir: './src',
    exclude: ['./src/config'],
  }),
)
