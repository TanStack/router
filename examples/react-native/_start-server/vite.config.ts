import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    tanstackStart(),
    react(),
  ],
  server: {
    port: 3050,
    cors: {
      // Permissive in dev so RN simulators / devices can hit the server
      // function endpoints from any origin. Lock this down for production.
      origin: true,
    },
  },
})
