import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      target: 'react',
      autoCodeSplitting: true,
      codeSplittingOptions: {
        splitBehavior: ({ routeId }) => {
          if (routeId === '/posts') {
            return [
              ['loader'],
              ['component'],
              ['pendingComponent', 'notFoundComponent', 'errorComponent'],
            ]
          }
        },
      },
    }),
    react(),
  ],
})
