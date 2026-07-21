import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'

const config = defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['development'],
  },
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'node',
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    entry: [
      './src/index.tsx',
      './src/history.ts',
      './src/react-dom.ts',
      './src/vite.ts',
    ],
    srcDir: './src',
  }),
)
