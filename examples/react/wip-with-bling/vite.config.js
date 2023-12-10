import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { bling } from '@tanstack/bling/vite'

export default defineConfig({
  plugins: [bling(), react()],
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      '@tanstack/store',
      '@tanstack/react-store',
      'use-sync-external-store',
      '@tanstack/bling',
    ],
  },
  ssr: {
    external: ['@tanstack/bling'],
  },
  build: {
    minify: false,
  },
})
