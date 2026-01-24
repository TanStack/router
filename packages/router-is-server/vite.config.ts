import { defineConfig, mergeConfig } from 'vite'
import { tanstackViteConfig } from '@tanstack/config/vite'

const config = defineConfig({
  plugins: [],
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: ['./src/server.ts', './src/client.ts', './src/development.ts'],
    srcDir: './src',
    cjs: true,
  }),
)
