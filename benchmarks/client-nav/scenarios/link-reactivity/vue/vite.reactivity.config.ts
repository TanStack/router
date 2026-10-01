import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { cpuSimulationExecArgv } from '../../../../cpu-simulation'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
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
      entry: './src/main.tsx',
      formats: ['es'],
      fileName: 'app',
    },
  },
  test: {
    execArgv: cpuSimulationExecArgv(),
    name: '@benchmarks/client-nav link-reactivity (vue)',
    watch: false,
    environment: 'jsdom',
    setupFiles: ['../../../vitest.setup.ts'],
  },
})
