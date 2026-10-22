import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    // Keep monorepo packages on this fixture's React 18 runtime.
    noExternal: ['@tanstack/react-router'],
    tsconfigPaths: true,
  },
  plugins: [tanstackStart(), viteReact()],
})
