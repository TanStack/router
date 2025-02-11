import { defineConfig } from '@rsbuild/core'
import { pluginSolid } from '@rsbuild/plugin-solid'
import { TanStackRouterRspack } from '@tanstack/router-plugin/rspack'
import { pluginBabel } from '@rsbuild/plugin-babel'

export default defineConfig({
  plugins: [
    pluginBabel({
      include: /\.(?:jsx|tsx)$/,
    }),
    pluginSolid(),
  ],
  tools: {
    rspack: {
      plugins: [TanStackRouterRspack({ target: 'solid' })],
    },
  },
})
