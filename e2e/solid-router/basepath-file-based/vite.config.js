import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/app/',
  plugins: [tanstackRouter({ target: 'solid' }), solid()],
})
