import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  ...(process.env.VITEST && {
    resolve: {
      conditions: ['development'],
    },
  }),
  test: {
    name: '@benchmarks/client-nav (react)',
    watch: false,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
