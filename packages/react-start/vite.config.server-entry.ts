import { tanstackViteConfig } from '@tanstack/config/vite'

export default tanstackViteConfig({
  srcDir: './src/default-entry',
  exclude: ['./src/default-entry/client.tsx'],
  entry: ['./src/default-entry/server.ts'],
  externalDeps: ['@tanstack/react-start/server', '#tanstack-start-entry'],
  outDir: './dist/default-entry',
  cjs: false,
})
