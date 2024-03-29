import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routeFileIgnorePattern: '.((css|const).ts)',
      experimental: {
        enableCodeSplitting: true,
      },
    }),
    react(),
    vanillaExtractPlugin(),
  ],
})
