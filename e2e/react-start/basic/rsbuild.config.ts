import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'
import { getStartModeConfig } from './start-mode-config'

const outDir = process.env.E2E_DIST_DIR ?? 'dist'
const startModeConfig = getStartModeConfig()
const clientOutput = process.env.TSS_RSB_CLIENT_OUTPUT

if (
  clientOutput !== undefined &&
  clientOutput !== 'module' &&
  clientOutput !== 'iife'
) {
  throw new Error(
    `Invalid TSS_RSB_CLIENT_OUTPUT: ${clientOutput}. Expected "module" or "iife".`,
  )
}

export default defineConfig({
  plugins: [pluginReact(), tanstackStart(startModeConfig)],
  output: {
    distPath: {
      root: outDir,
    },
  },
  environments: {
    client: {
      output: {
        module:
          clientOutput === undefined ? undefined : clientOutput === 'module',
      },
    },
  },
})
