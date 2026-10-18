import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    projects: [
      {
        // Fast tier (`test:unit`): compiles and evaluates in process; a Vite
        // dev server in middleware mode is allowed.
        extends: true,
        test: {
          name: 'unit',
          exclude: [...configDefaults.exclude, 'integration/**'],
          typecheck: { enabled: true },
        },
      },
      {
        // Slow tier (`test:integration`): real builds, Rsbuild dev servers,
        // child Node runs and browsers.
        extends: true,
        test: {
          name: 'integration',
          include: ['integration/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    entry: [
      './src/index.ts',
      './src/utils.ts',
      './src/vite/index.ts',
      './src/rsbuild/index.ts',
      './src/rsbuild/types.ts',
      './src/rsbuild/import-protection-loader.ts',
      './src/rsbuild/start-compiler-metadata-loader.ts',
    ],
    srcDir: './src',
    outDir: './dist',
    cjs: false,
  }),
)
