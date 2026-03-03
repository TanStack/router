import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import solid from 'vite-plugin-solid'
import packageJson from './package.json'

const config = defineConfig({
  plugins: [solid()],
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    typecheck: { enabled: true },
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: './src/index.tsx',
    srcDir: './src',
  }),
)
