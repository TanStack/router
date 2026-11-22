import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const config = defineConfig({
  define: {
    __TSR_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    // `tsr watch` on an app in a temporary directory: file watchers and the
    // generator's writes, seconds on a slow CI runner
    testTimeout: 15_000,
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    entry: './src/index.ts',
    srcDir: './src',
  }),
)
