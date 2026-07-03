import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: rootDir,
  plugins: [
    !!(process.env.VITEST && process.env.WITH_INSTRUMENTATION) &&
      codspeedPlugin(),
    tanstackStart({
      srcDirectory: 'src',
    }),
    react(),
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
    name: '@benchmarks/memory-server serialization-payload (react)',
    watch: false,
    environment: 'node',
  },
})
