import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'
import type { ViteUserConfig } from 'vitest/config'

const config = defineConfig({
  plugins: [react()] as ViteUserConfig['plugins'],
  test: {
    include: ['**/*.{test-d,test,spec}.?(c|m)[jt]s?(x)'],
    name: packageJson.name,
    watch: false,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setupTests.tsx'],
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    srcDir: './src',
    entry: './src/index.tsx',
    cjs: false,
  }),
)
