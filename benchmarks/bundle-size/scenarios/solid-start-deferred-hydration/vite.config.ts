import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'

export default defineConfig({
  plugins: [tanstackStart(), solid({ ssr: true })],
})
