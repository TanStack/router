import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    // the compiler's self-checks (`src/compiler/self-checks.ts`) are on for
    // every compile of the tests: outputs verified, invariants throw
    env: { TSR_COMPILER_VERIFY: process.env.TSR_COMPILER_VERIFY ?? '1' },
    // known-bug pins (`.fails`): one fails when anything but its assertions
    // fails, and `COMPILER_TESTS_PINS=run` runs them as ordinary tests. By
    // path: the harness package depends on this one
    setupFiles: ['../compiler-test-utils/src/pins-setup.ts'],
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    entry: ['./src/index.ts', './src/compiler/index.ts'],
    srcDir: './src',
  }),
)
