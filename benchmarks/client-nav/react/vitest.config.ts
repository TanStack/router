import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import codspeedPlugin from '@codspeed/vitest-plugin'

export default defineConfig({
  plugins: [!!process.env.WITH_INSTRUMENTATION && codspeedPlugin(), react()],
  resolve: {
    conditions: ['development'],
  },
  test: {
    name: '@benchmarks/client-nav (react)',
    watch: false,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
