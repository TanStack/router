import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tanstackRouter({ target: 'solid' }), solid()],
})
