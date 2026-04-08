import { defineConfig } from '@rsbuild/core'
import { pluginBabel } from '@rsbuild/plugin-babel'
import { pluginVue } from '@rsbuild/plugin-vue'
import { pluginVueJsx } from '@rsbuild/plugin-vue-jsx'
import { tanstackStart } from '@tanstack/vue-start/plugin/rsbuild'

export default defineConfig({
  plugins: [
    pluginBabel({
      include: /\.(?:jsx|tsx)$/,
    }),
    pluginVue(),
    pluginVueJsx(),
    tanstackStart(),
  ],
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
    },
  } as Record<string, unknown>,
})
