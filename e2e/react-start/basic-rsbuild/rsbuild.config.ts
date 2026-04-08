import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

export default defineConfig({
  plugins: [pluginReact({ splitChunks: false }), tanstackStart()],
  // Workaround: @rsbuild/plugin-react@2.0.0-alpha.3 accesses
  // config.performance.chunkSplit.strategy which is no longer defaulted
  // in rsbuild v2. Provide it explicitly to avoid the crash.
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
    },
  } as Record<string, unknown>,
})
