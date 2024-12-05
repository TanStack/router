import { defineConfig } from 'vitest/config'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    typecheck: { enabled: true },
    // setupFiles: ['./tests/setupTests.tsx'],
  },
})

export default config
