import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // optimizeDeps: {
  //   include: ['use-sync-external-store/shim/with-selector'],
  // },
  build: {
    minify: false,
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
})
