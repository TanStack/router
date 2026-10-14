import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'
import { deploymentMetadata } from './src/deployment-metadata.config'

const outDir = process.env.E2E_DIST_DIR ?? 'dist'

export default defineConfig({
  // Rsbuild has no provider discovery, so the metadata is passed explicitly.
  plugins: [
    pluginReact(),
    tanstackStart({
      deploymentMetadata: {
        value: deploymentMetadata.value,
        carriers: [...deploymentMetadata.carriers],
      },
    }),
  ],
  output: {
    distPath: {
      root: outDir,
    },
  },
})
