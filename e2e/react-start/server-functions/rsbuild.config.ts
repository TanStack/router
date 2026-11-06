import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'
import { getStartModeConfig } from './start-mode-config'
import type { RsbuildPluginAPI } from '@rsbuild/core'

const outDir = process.env.E2E_DIST_DIR ?? 'dist'
const startModeConfig = getStartModeConfig()

export default defineConfig({
  plugins: [
    pluginReact(),
    tanstackStart(startModeConfig),
    {
      name: 'server-function-input-fixture',
      setup(api: RsbuildPluginAPI) {
        api.transform(
          { test: /consistent\.tsx$/, order: 'pre' },
          ({ code }) => {
            return code.replaceAll('__fixture_createServerFn', 'createServerFn')
          },
        )
      },
    },
  ],
  output: {
    distPath: {
      root: outDir,
    },
  },
  performance: {
    buildCache: process.env.E2E_RSBUILD_BUILD_CACHE !== 'false',
  },
})
