import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'
import codspeedPlugin from '@codspeed/vitest-plugin'

export default defineConfig({
  plugins: [solid({ ssr: false, dev: false, hot: false }), codspeedPlugin()],
  resolve: {
    conditions: ['solid', 'browser'],
  },
  test: {
    environment: 'jsdom',
    include: ['solid/**/*.bench.tsx'],
    benchmark: {
      include: ['solid/**/*.bench.tsx'],
    },
    server: {
      deps: {
        inline: [/@solidjs/, /@tanstack\/solid-store/],
      },
    },
  },
})
