import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackBuildConfig } from '@tanstack/config/build'
import react from '@vitejs/plugin-react'

const config = defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    name: 'react-router',
    watch: false,
    environment: 'jsdom',
  },
})

export default mergeConfig(
  config,
  tanstackBuildConfig({
    entry: './src/index.tsx',
    srcDir: './src',
  }),
)
