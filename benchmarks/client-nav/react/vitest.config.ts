import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import codspeedPlugin from '@codspeed/vitest-plugin'

export default defineConfig({
  plugins: [react(), codspeedPlugin()],
  test: {
    environment: 'jsdom',
    include: ['react/**/*.bench.tsx'],
    benchmark: {
      include: ['react/**/*.bench.tsx'],
    },
  },
})
