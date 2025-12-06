import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import vueJsx from '@vitejs/plugin-vue-jsx'
import packageJson from './package.json'

const config = defineConfig({
  plugins: [vueJsx()],
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
    cjs: false,
  }),
)
