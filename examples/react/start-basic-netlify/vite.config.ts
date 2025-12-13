import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import viteReact from '@vitejs/plugin-react'
import netlifyPlugin from '@netlify/vite-plugin-tanstack-start'

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 3000,
    strictPort: true,
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      srcDirectory: 'src',
    }),
    viteReact(),
    netlifyPlugin(),
  ],
})
