import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'
import minifyScriptPlugin from './vite-minify-plugin'
import type { ViteUserConfig } from 'vitest/config'

const config = defineConfig({
  plugins: [minifyScriptPlugin(), react()] as ViteUserConfig['plugins'],
  test: {
    name: packageJson.name,
    watch: false,
    environment: 'jsdom',
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    srcDir: './src',
    entry: './src/index.tsx',
    externalDeps: [
      'tanstack-start-server-fn-manifest:v',
      'tanstack-start-router-manifest:v',
      'tanstack-start-server-routes-manifest:v',
    ],
  }),
)
