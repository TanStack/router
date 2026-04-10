import { defineConfig, mergeConfig } from 'vitest/config'
import type { ViteUserConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import vueJsx from '@vitejs/plugin-vue-jsx'

const config = defineConfig({
  plugins: [vueJsx()],
})

const merged: ViteUserConfig = mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    entry: ['./src/index.tsx'],
    srcDir: './src',
    cjs: false,
  }),
)

export default merged
