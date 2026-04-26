import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import solid from 'vite-plugin-solid'
import { nitro } from 'nitro/vite'

export default defineConfig({
  plugins: [nitro(), tanstackStart(), solid({ ssr: true })],
})
