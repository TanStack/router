import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'

const isVerboseFileRoutes = process.env.VERBOSE_FILE_ROUTES === '1' || false
console.info(`Verbose file routes is set to: ${isVerboseFileRoutes}.`)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({
      target: 'solid',
      autoCodeSplitting: true,
      verboseFileRoutes: isVerboseFileRoutes,
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
