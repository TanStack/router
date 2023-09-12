import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      'use-sync-external-store',
      '@tanstack/react-store',
    ],
  },
  build: {
    minify: false,
  },
})
