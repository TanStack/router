import { defineConfig } from '@rsbuild/core'
import { pluginSolid } from '@rsbuild/plugin-solid'
import { tanstackRouter } from '@tanstack/router-plugin/rspack'
import { pluginBabel } from '@rsbuild/plugin-babel'

export default defineConfig({
  plugins: [
    pluginBabel({
      include: /\.(?:jsx|tsx)$/,
    }),
    pluginSolid({
      solidPresetOptions: {
        moduleName: '@solidjs/web',
      },
    }),
  ],
  tools: {
    rspack: {
      plugins: [tanstackRouter({ target: 'solid', autoCodeSplitting: true })],
      resolve: {
        alias: {
          'solid-js/web': '@solidjs/web',
        },
      },
    },
  },
})
