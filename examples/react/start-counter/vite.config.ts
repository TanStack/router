import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import netlify from '@netlify/vite-plugin-tanstack-start'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [tanstackStart(), viteReact(), netlify()],
})
