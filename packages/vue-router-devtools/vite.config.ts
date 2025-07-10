import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import vueJsx from '@vitejs/plugin-vue-jsx'
import type { UserConfig } from 'vitest/config'

const config = defineConfig({
  plugins: [vueJsx()] as UserConfig['plugins'],
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: './src/index.tsx',
    srcDir: './src',
  }),
)
