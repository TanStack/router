import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import solid from 'vite-plugin-solid'
import packageJson from './package.json'
import type { ViteUserConfig } from 'vitest/config'

const config = defineConfig({
  plugins: [solid()] as ViteUserConfig['plugins'],
  test: {
    watch: false,
    projects: [
      {
        extends: true,
        test: {
          name: packageJson.name,
          dir: './src',
          include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
          typecheck: { enabled: true },
          environment: 'jsdom',
          setupFiles: ['./src/tests/jest-dom.setup.ts'],
        },
      },
      {
        // Keep the Start registration in its own TypeScript program.
        extends: true,
        test: {
          name: `${packageJson.name} (lifecycle phases)`,
          dir: './tests/lifecycle-phases',
          environment: 'node',
          typecheck: {
            enabled: true,
            tsconfig: './tests/lifecycle-phases/tsconfig.json',
          },
        },
      },
    ],
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    srcDir: './src',
    entry: ['./src/index.tsx', './src/Hydrate.tsx', './src/hydration.ts'],
    cjs: false,
  }),
)
