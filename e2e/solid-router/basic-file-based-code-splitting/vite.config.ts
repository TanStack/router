import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({
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
    solid(),
  ],
})
