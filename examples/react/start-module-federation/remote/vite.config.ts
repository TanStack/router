import { tanstackStartModuleFederation } from '@module-federation/tanstack/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 3001,
    strictPort: true,
    cors: true,
    origin: 'http://127.0.0.1:3001',
  },
  preview: {
    host: '127.0.0.1',
    port: 3001,
    strictPort: true,
    cors: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStartModuleFederation({
      name: 'catalog',
      dts: false,
      exposes: {
        './ProductList': './src/components/ProductList.tsx',
        './ProductDetail': './src/components/ProductDetail.tsx',
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
