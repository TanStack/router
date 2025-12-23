import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import vueJsx from '@vitejs/plugin-vue-jsx'

const config = defineConfig({
  plugins: [vueJsx()],
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: ['./src/index.tsx'],
    srcDir: './src',
    cjs: false,
  }),
)
