import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    minify: false,
  },
  ssr: {
    noExternal: ['use-sync-external-store'],
    optimizeDeps: ['use-sync-external-store'],
  },
  // optimizeDeps: {
  //   include: ['use-sync-external-store'],
  // },
})
