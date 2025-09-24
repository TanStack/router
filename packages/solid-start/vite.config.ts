import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import { copyFilesPlugin } from '@tanstack/router-utils'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    name: packageJson.name,
    watch: false,
    environment: 'jsdom',
  },
  plugins: [
    copyFilesPlugin({
      pattern: ['*.ts', '*.tsx', '!*.d.ts'],
      fromDir: 'src/default-entry',
      toDir: 'dist/plugin/default-entry',
    }),
  ],
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    srcDir: './src',
    exclude: ['./src/default-entry'],
    entry: [
      './src/index.ts',
      './src/client.tsx',
      './src/server.tsx',
      './src/plugin/vite.ts',
    ],
    externalDeps: [
      '@tanstack/solid-start-client',
      '@tanstack/solid-start-server',
    ],
    cjs: false,
  }),
)
