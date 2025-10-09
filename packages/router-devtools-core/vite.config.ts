import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import solid from 'vite-plugin-solid'
import type { UserConfig } from 'vitest/config'

const config = defineConfig({
  plugins: [solid()] as UserConfig['plugins'],
})

const merged = mergeConfig(
  config,
  tanstackViteConfig({
    entry: './src/index.tsx',
    srcDir: './src',
  }),
)

// TODO: update tanstackViteConfig to expose the except option from vite-plugin-externalize-deps
// so that we don't have to do this dance to bundle something
merged.plugins.push({
  name: 'vite-plugin-override-vite-plugin-externalize-deps',
  config: (config: UserConfig) => {
    if (typeof config?.build?.rollupOptions?.external !== 'function') {
      // this can never happen, but we need to make typescript happy
      return
    }
    const existing = config.build.rollupOptions.external
    config.build.rollupOptions.external = (
      id: string,
      parentId?: string,
      isResolved?: boolean,
    ) => {
      if (id === 'solid-js') return false
      return existing(id, parentId, isResolved ?? false)
    }
    return config
  },
})

merged.build.rollupOptions.output.manualChunks = false
merged.build.rollupOptions.output.preserveModules = false

export default merged
