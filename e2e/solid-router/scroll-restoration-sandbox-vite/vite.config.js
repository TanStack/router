import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), tanstackRouter({ target: 'solid' }), solid()],
})
