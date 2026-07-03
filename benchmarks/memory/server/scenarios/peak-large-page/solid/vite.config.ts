import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import solid from 'vite-plugin-solid'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: rootDir,
  plugins: [
    !!(process.env.VITEST && process.env.WITH_INSTRUMENTATION) &&
      codspeedPlugin(),
    tanstackStart({
      srcDirectory: 'src',
    }),
    solid({ ssr: true, hot: false, dev: false }),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    minify: false,
  },
  test: {
    // Keep lazily-compiled code alive for the whole run: the pinned
    // collections age code fast enough for V8 to flush unused bytecode,
    // and the mid-measurement recompile injects a multi-MB allocation
    // burst at a run-dependent time.
    execArgv: ['--no-flush-bytecode'],
    name: '@benchmarks/memory-server peak-large-page (solid)',
    watch: false,
    environment: 'node',
    server: {
      deps: {
        inline: [/@solidjs/, /@tanstack\/solid-store/],
      },
    },
  },
})
