import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanStackRouterSSR } from '@tanstack/vite-plugin-router-ssr'

export default defineConfig({
  plugins: [react(), tanStackRouterSSR()],
  build: {
    minify: false,
  },
})
