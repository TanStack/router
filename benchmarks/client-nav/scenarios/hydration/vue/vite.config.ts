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
    // Production Vue normally omits attribute mismatch checks. Keep them on so
    // the benchmark cannot silently accept incorrect hash-sensitive SSR DOM.
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: true,
  },
  plugins: [
    !!(process.env.VITEST && process.env.WITH_INSTRUMENTATION) &&
      codspeedPlugin(),
    vue(),
    vueJsx(),
  ],
  resolve: { conditions: ['browser', 'production'] },
  build: {
    outDir: './dist/client',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: './src/client.tsx',
      name: 'HydrationBenchmark',
      formats: ['iife'],
      fileName: () => 'client.js',
    },
  },
  test: {
    execArgv: cpuSimulationExecArgv(),
    name: '@benchmarks/client-nav hydration (vue)',
    watch: false,
    environment: 'node',
    isolate: true,
    include: ['hydration.test.ts'],
    benchmark: { include: ['speed.bench.ts'] },
  },
})
