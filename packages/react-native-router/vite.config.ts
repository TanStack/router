import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: ['./src/index.tsx', './src/core.ts', './src/history.ts'],
    srcDir: './src',
  }),
)
