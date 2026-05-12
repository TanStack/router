import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const config = defineConfig({
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
    entry: [
      './src/index.tsx',
      './src/client/index.ts',
      './src/client-rpc/index.ts',
      './src/fake-entries/start.ts',
      './src/fake-entries/router.ts',
      './src/fake-entries/plugin-adapters.ts',
    ],
    cjs: false,
    externalDeps: [
      '#tanstack-start-entry',
      '#tanstack-router-entry',
      '#tanstack-start-plugin-adapters',
    ],
  }),
)
