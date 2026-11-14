import { defineConfig } from 'vitest/config'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'vue',
      autoCodeSplitting: true,
    }),
    vueJsx(),
  ],
  test: {
    watch: false,
    environment: 'jsdom',
    include: ['tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
    typecheck: {
      enabled: true,
      include: ['tests/**/*.test-d.tsx'],
    },
  },
})
