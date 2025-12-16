import { defineConfig } from '@rsbuild/core'
import { pluginVue } from '@rsbuild/plugin-vue'
import { tanstackRouter } from '@tanstack/router-plugin/rspack'
import { pluginBabel } from '@rsbuild/plugin-babel'

export default defineConfig({
  plugins: [
    pluginBabel({
      include: /\.(?:jsx|tsx)$/,
    }),
    pluginVue(),
  ],
  tools: {
    rspack: {
      plugins: [tanstackRouter({ target: 'vue', autoCodeSplitting: true })],
    },
  },
})
