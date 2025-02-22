import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import solid from 'vite-plugin-solid'
import packageJson from './package.json'
import type { ViteUserConfig } from 'vitest/config'

const config = defineConfig({
  plugins: [solid()] as ViteUserConfig['plugins'],
  test: {
    name: packageJson.name,
    watch: false,
    environment: 'jsdom',
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: './src/index.tsx',
    srcDir: './src',
    externalDeps: ['tsr:server-fn-manifest'],
  }),
)
