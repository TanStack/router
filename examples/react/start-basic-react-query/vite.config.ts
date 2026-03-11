import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import viteReact from '@vitejs/plugin-react'
import { devtools } from '@tanstack/devtools-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart(),
    viteReact(),
  ],
})
