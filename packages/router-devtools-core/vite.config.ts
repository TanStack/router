import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import solid from 'vite-plugin-solid'

const config = defineConfig({
  plugins: [solid()],
})

const merged = mergeConfig(
  config,
  tanstackViteConfig({
    entry: './src/index.tsx',
    srcDir: './src',
    bundledDeps: ['solid-js', 'solid-js/web'],
  }),
)

merged.build.rollupOptions.output.manualChunks = false
merged.build.rollupOptions.output.preserveModules = false

export default merged
