import { dirname, join } from 'node:path'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      addExtensions: true,
      generatedRouteTree: './src/client/routeTree.gen.ts',
      quoteStyle: 'single',
      routesDirectory: './src/client/routes',
      routeFileIgnorePrefix: '-',
    }),
    react(),
  ],
  root: join(dirname(fileURLToPath(import.meta.url)), 'src', 'client'),
})
