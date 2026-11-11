import { tanstackStartModuleFederation } from '@module-federation/tanstack/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStartModuleFederation({
      name: 'host',
      dts: false,
      remotes: {
        catalog: {
          type: 'module',
          name: 'catalog',
          entry: 'http://127.0.0.1:3001/remoteEntry.js',
        },
      },
    }),
    tanstackStart({
      srcDirectory: 'src',
    }),
    viteReact(),
  ],
  ssr: {
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
  },
})
