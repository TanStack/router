import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [tsConfigPaths({ projects: ['./tsconfig.json'] }), tanstackStart()],
})
