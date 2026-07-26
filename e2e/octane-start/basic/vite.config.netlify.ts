import netlify from '@netlify/vite-plugin-tanstack-start'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/octane-start/plugin/vite'

export default defineConfig({
  plugins: [netlify(), tanstackStart()],
})
