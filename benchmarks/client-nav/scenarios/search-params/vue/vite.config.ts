import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import codspeedPlugin from '@codspeed/vitest-plugin'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const setupFile = fileURLToPath(
  new URL('../../../vitest.setup.ts', import.meta.url),
)

export default defineConfig({
  root: rootDir,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [
    !!(process.env.VITEST && process.env.WITH_INSTRUMENTATION) &&
      codspeedPlugin(),
    vue(),
    vueJsx(),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: './src/app.tsx',
      formats: ['es'],
      fileName: 'app',
    },
  },
  test: {
    name: '@benchmarks/client-nav search-params (vue)',
    watch: false,
    environment: 'jsdom',
    setupFiles: [setupFile],
  },
})
