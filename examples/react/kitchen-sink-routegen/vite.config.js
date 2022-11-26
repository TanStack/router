import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// import { tanStackRouterSSR } from '@tanstack/vite-plugin-router-ssr'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})
