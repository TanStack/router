import { defineConfig } from 'vite'
import { TanStackStartVitePlugin } from '@tanstack/react-start/plugin'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    TanStackStartVitePlugin({
      tsr: {
        srcDirectory: './src/app',
      },
    }),
  ],
})
