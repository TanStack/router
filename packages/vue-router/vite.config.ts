import { resolve } from 'node:path'
import { defineConfig, mergeConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { tanstackViteConfig } from '@tanstack/config/vite'
import packageJson from './package.json'

const config = defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@tanstack/vue-router': resolve(__dirname, 'src'),
    },
  },
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    typecheck: { enabled: true },
    setupFiles: ['./tests/setupTests.tsx'],
  },
}) 

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: './src/index.ts',
    srcDir: './src',
  }),
)