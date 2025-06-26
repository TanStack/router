import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import solid from 'vite-plugin-solid'
import packageJson from './package.json'
import type { ViteUserConfig } from 'vitest/config'

const config = defineConfig({
  plugins: [solid({ solid: { generate: 'ssr' } })] as ViteUserConfig['plugins'], // [solid({ solid: { generate: 'ssr' } })]
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
    entry: ['./src/ssr/client.tsx','./src/ssr/server.tsx'],
    srcDir: './src',
    outDir: './dist/ssr',
    externalDeps: ['solid-js/web'],
  }),
)
