import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import codspeedPlugin from '@codspeed/vitest-plugin'

export default defineConfig({
  plugins: [vue(), codspeedPlugin()],
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    include: ['vue/**/*.bench.ts'],
    benchmark: {
      include: ['vue/**/*.bench.ts'],
    },
  },
})
