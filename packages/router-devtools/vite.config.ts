import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import react from '@vitejs/plugin-react'

const config = defineConfig({
  plugins: [react()],
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: './src/index.tsx',
    srcDir: './src',
  }),
)
