import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    typecheck: { enabled: true },
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: [
      './src/index.ts',
      './src/rsbuild/index.ts',
      './src/rsbuild/start-compiler-loader.ts',
      './src/rsbuild/route-tree-loader.ts',
    ],
    srcDir: './src',
    outDir: './dist',
    cjs: false,
  }),
)
