import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import packageJson from './package.json'

export default defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    typecheck: { enabled: true },
  },
  plugins: [
    tanstackRouter({
      target: 'solid',
      autoCodeSplitting: true,
      verboseFileRoutes: false,
    }),
    solid(),
  ],
})
