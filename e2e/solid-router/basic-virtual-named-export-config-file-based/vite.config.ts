import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'solid', virtualRouteConfig: './routes.ts' }),
    solid(),
  ],
})
