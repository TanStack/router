import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    typecheck: { enabled: true },
    // The retained-heap gate forces GC; the workers get the flag.
    pool: 'forks',
    execArgv: ['--expose-gc'],
    // the compiler's invariant checker (`src/compiler/verify.ts`) is on for
    // every compile of the tests
    env: { TSR_COMPILER_VERIFY: process.env.TSR_COMPILER_VERIFY ?? '1' },
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
