import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginSass } from '@rsbuild/plugin-sass'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'
import { cloudflare } from 'rsbuild-plugin-cloudflare'

// E2E_RSBUILD_CLOUDFLARE: Set to 'true' to run the SSR environment in workerd
const useCloudflare = process.env.E2E_RSBUILD_CLOUDFLARE === 'true'

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginSass(),
    ...(useCloudflare
      ? [
          cloudflare({
            rsbuildEnvironment: { name: 'ssr' },
            inspectorPort: false,
          }),
        ]
      : []),
    tanstackStart(),
  ],
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
      // Extract the shared component and its helper into their own chunks so
      // a route depends on a shared chunk that depends on another shared chunk.
      config.optimization.splitChunks = {
        cacheGroups: {
          sharedHeader: {
            test: /[\\/]src[\\/]components[\\/]/,
            chunks: 'async',
            minChunks: 2,
            minSize: 0,
            enforce: true,
            name: 'shared-header',
          },
          sharedFormat: {
            test: /[\\/]src[\\/]utils[\\/]/,
            chunks: 'async',
            minChunks: 2,
            minSize: 0,
            enforce: true,
            name: 'shared-format',
          },
        },
      }
    },
  },
})
