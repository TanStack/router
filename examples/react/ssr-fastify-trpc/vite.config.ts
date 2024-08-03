import { dirname, join } from 'path'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'

import tsrOptions from './tsr.config.json' assert { type: 'json' }

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite(tsrOptions as Parameters<typeof TanStackRouterVite>[0]),
    react(),
  ],
  root: join(dirname(fileURLToPath(import.meta.url)), 'src', 'client'),
})
