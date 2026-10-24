import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

const serverEntry = process.env.TSS_E2E_SERVER_ENTRY
const outDir = process.env.E2E_DIST_DIR ?? 'dist'

export default defineConfig({
  plugins: [
    pluginReact(),
    tanstackStart({
      server: serverEntry ? { entry: serverEntry } : undefined,
    }),
  ],
  output: {
    distPath: {
      root: outDir,
    },
  },
})
