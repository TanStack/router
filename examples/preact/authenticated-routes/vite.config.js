import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'preact',
      autoCodeSplitting: true,
    }),
    preact(),
  ],
})
