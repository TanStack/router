import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import { octane } from 'octane/compiler/vite'
import packageJson from './package.json'

const config = defineConfig({
  plugins: [octane()],
  test: {
    typecheck: { enabled: true },
    name: packageJson.name,
    watch: false,
    environment: 'jsdom',
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    srcDir: './src',
    entry: './src/index.ts',
    cjs: false,
  }),
)
