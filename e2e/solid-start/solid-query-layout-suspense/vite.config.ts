import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import solid from '@solidjs/vite-plugin'

export default defineConfig({
  plugins: [tanstackStart(), solid({ ssr: true })],
})
