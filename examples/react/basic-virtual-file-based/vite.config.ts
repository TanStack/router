import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { routes } from './routes'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({ virtualRouteConfig: routes }),
    react(),
    tailwindcss(),
  ],
})
