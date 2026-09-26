import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginSass } from '@rsbuild/plugin-sass'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

export default defineConfig({
  plugins: [pluginReact(), pluginSass(), tanstackStart()],
  output: {
    distPath: {
      root: process.env.E2E_DIST_DIR ?? 'dist-rsbuild-ssr',
    },
  },
  tools: {
    rspack(config, { environment }) {
      if (environment.name === 'ssr') {
        config.output ??= {}
        config.output.filename = 'server.js'
      }
      if (environment.name !== 'client') {
        return
      }
      config.optimization ??= {}
      // Extract the small shared component to reproduce #8415 reliably.
      config.optimization.splitChunks = {
        cacheGroups: {
          shared: {
            test: /[\\/]src[\\/]components[\\/]/,
            chunks: 'async',
            minChunks: 2,
            minSize: 0,
            enforce: true,
            name: 'shared-header',
          },
        },
      }
    },
  },
})
