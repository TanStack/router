import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import { copyFilesPlugin } from '@tanstack/router-utils'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    typecheck: { enabled: true },
  },
  plugins: [
    copyFilesPlugin({
      pattern: ['*.ts', '*.tsx', '!*.d.ts'],
      fromDir: 'src/default-entry',
      toDir: 'dist/default-entry',
    }),
  ],
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: './src/index.ts',
    srcDir: './src',
    outDir: './dist',
    cjs: false
  }),
)
