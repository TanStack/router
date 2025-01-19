import path from 'node:path'
import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'
import type { UserConfig } from 'vitest/config'

const config = defineConfig({
  plugins: [react()] as UserConfig['plugins'],
  resolve: {
    alias: {
      '@tanstack/router-core': path.resolve(
        __dirname,
        './../node_modules/@tanstack/router-core/src/',
      ),
    },
  },
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    typecheck: { enabled: true },
    setupFiles: ['./tests/setupTests.tsx'],
    alias: [
      {
        find: '@tanstack/router-core',
        replacement: path.resolve(__dirname, '../router-core/src/index.ts'),
      },
    ],
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: './src/index.tsx',
    srcDir: './src',
  }),
)
