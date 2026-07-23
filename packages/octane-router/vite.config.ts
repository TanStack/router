import { defineConfig } from 'vitest/config'
import { octane } from 'octane/compiler/vite'
import packageJson from './package.json'

export default defineConfig({
  plugins: [octane()],
  ...(process.env.VITEST && {
    resolve: {
      conditions: ['development'],
    },
  }),
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    typecheck: { enabled: true },
  },
})
