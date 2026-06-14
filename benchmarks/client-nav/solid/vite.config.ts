import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'
import codspeedPlugin from '@codspeed/vitest-plugin'

const setupFile = fileURLToPath(new URL('../vitest.setup.ts', import.meta.url))

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [
    !!(process.env.VITEST && process.env.WITH_INSTRUMENTATION) &&
      codspeedPlugin(),
    solid({ hot: false, dev: false }),
  ],
  build: {
    outDir: './solid/dist',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: './solid/src/app.tsx',
      formats: ['es'],
      fileName: 'app',
    },
  },
  resolve: {
    conditions: ['solid', 'browser'],
  },
  test: {
    name: '@benchmarks/client-nav (solid)',
    watch: false,
    environment: 'jsdom',
    setupFiles: [setupFile],
    server: {
      deps: {
        inline: [/@solidjs/, /@tanstack\/solid-store/],
      },
    },
  },
})
