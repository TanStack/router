import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const config = defineConfig({
  plugins: [vueJsx()],
  resolve: {
    alias: {
      '@tanstack/vue-router': resolve(__dirname, 'src'),
    },
    // Add 'development' condition for tests to resolve @tanstack/router-core/isServer
    // to the development export (isServer = undefined) instead of node (isServer = true)
    ...(process.env.VITEST && { conditions: ['development'] }),
  },
  test: {
    watch: false,
    projects: [
      {
        extends: true,
        test: {
          name: packageJson.name,
          dir: './tests',
          environment: 'jsdom',
          typecheck: {
            enabled: true,
            exclude: [
              ...configDefaults.typecheck.exclude,
              '**/start-register/**',
              '**/docs-examples/**',
            ],
          },
          setupFiles: ['./tests/jest-dom.setup.ts', './tests/setupTests.tsx'],
        },
      },
      {
        // Type tests that register a Start app (`Register.ssr: true` plus a
        // concrete `Register.router`). The module augmentation is global to a
        // tsc program, so these run in their own project with their own tsconfig
        // (tests/start-register/tsconfig.json), which also keeps them out of the
        // package's main tsconfig program. Source errors are ignored here only
        // because the library source is not written to type-check under a concrete
        // registered router (apps consume the .d.ts); src is still checked by the
        // main project and by test:types.
        extends: true,
        test: {
          name: `${packageJson.name} (start register)`,
          dir: './tests/start-register',
          environment: 'node',
          typecheck: {
            enabled: true,
            tsconfig: './tests/start-register/tsconfig.json',
            ignoreSourceErrors: true,
          },
        },
      },
      {
        // The docs' code examples compiled under their own Start register
        // (ssr, router and the adapters' config); same setup as start-register.
        extends: true,
        test: {
          name: `${packageJson.name} (docs examples)`,
          dir: './tests/docs-examples',
          environment: 'node',
          typecheck: {
            enabled: true,
            tsconfig: './tests/docs-examples/tsconfig.json',
            ignoreSourceErrors: true,
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
    entry: [
      './src/index.tsx',
      './src/index.dev.tsx',
      './src/ssr/client.ts',
      './src/ssr/server.ts',
    ],
    srcDir: './src',
    cjs: false,
  }),
)
