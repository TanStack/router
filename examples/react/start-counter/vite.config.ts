import { TanStackStartVitePlugin } from '@tanstack/react-start/plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [TanStackStartVitePlugin()],
})
