import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'
import { routeModules } from './route-modules.ts'

// The e2e build of each toolchain and mode writes to its own directory.
const outDir = process.env.E2E_DIST_DIR ?? 'dist'

export default defineConfig({
  plugins: [pluginReact(), tanstackStart({ router: { routeModules } })],
  output: {
    distPath: {
      root: outDir,
    },
  },
})
