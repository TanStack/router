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
    bundledDeps: ['solid-js', '@solidjs/web'],
  }),
)

merged.build.rollupOptions.output.manualChunks = undefined
merged.build.rollupOptions.output.preserveModules = false

export default merged
