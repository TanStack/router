import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    TanStackRouterVite({ target: 'solid', autoCodeSplitting: true }),
    solid(),
  ],
})
