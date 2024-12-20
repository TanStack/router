import { defineConfig } from 'vitest/config'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'node',
    typecheck: { enabled: true },
  },
})

export default config
