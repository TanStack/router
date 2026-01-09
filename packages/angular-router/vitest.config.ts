import angular from '@analogjs/vite-plugin-angular'
import { defineConfig } from 'vite'
import packageJson from './package.json'

export default defineConfig({
  plugins: [angular()],
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    typecheck: { enabled: true },
    setupFiles: ['tests/setupTests.ts'],
  },
})
