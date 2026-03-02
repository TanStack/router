import { defineConfig } from 'vitest/config'
import vueJsx from '@vitejs/plugin-vue-jsx'
import codspeedPlugin from '@codspeed/vitest-plugin'

export default defineConfig({
  plugins: [!!process.env.WITH_INSTRUMENTATION && codspeedPlugin(), vueJsx()],
  resolve: {
    conditions: ['development'],
  },
  test: {
    name: '@benchmarks/client-nav (vue)',
    watch: false,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
