import { tanstackViteConfig } from '@tanstack/vite-config'
import { mergeConfig, defineConfig } from 'vitest/config'

const config = defineConfig({})

export default mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.server-entry.json',
    srcDir: './src/default-entry',
    exclude: ['./src/default-entry/client.ts'],
    entry: ['./src/default-entry/server.ts'],
    externalDeps: ['@tanstack/octane-start/server'],
    outDir: './dist/default-entry',
    cjs: false,
  }),
)
