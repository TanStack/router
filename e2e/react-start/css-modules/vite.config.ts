import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

// Environment variables for different test configurations:
// - VITE_BASE_PATH: Set to '/my-app' for basepath testing
// - VITE_USE_NITRO: Set to 'true' to enable Nitro server
const basePath = process.env.VITE_BASE_PATH
const useNitro = process.env.VITE_USE_NITRO === 'true'

export default defineConfig(async () => {
  // Dynamically import nitro only when needed to avoid loading it when not used
  const nitroPlugin = useNitro ? [(await import('nitro/vite')).nitro()] : []

  return {
    base: basePath,
    server: {
      port: 3000,
    },
    plugins: [
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
      // Nitro is placed BEFORE tanstackStart to test that our CSS middleware
      // works regardless of plugin order (nitro has a catch-all middleware)
      ...nitroPlugin,
      tanstackStart(),
      viteReact(),
    ],
  }
})
