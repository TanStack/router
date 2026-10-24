import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import solid from 'vite-plugin-solid'
import packageJson from './package.json'
import type { ViteUserConfig } from 'vitest/config'

const config = defineConfig(({ mode }) => {
  if (mode === 'server') {
    return {
      plugins: [solid({ ssr: true })] as ViteUserConfig['plugins'],
      test: {
        name: `${packageJson.name} (server)`,
        dir: './tests/server',
        watch: false,
        environment: 'node',
        typecheck: { enabled: true },
        server: {
          deps: {
            inline: [/@solidjs/, /@tanstack\/solid-store/],
          },
        },
      },
    }
  }

  return {
    plugins: [solid()] as ViteUserConfig['plugins'],
    // Add 'development' condition for tests to resolve @tanstack/router-core/isServer
    // to the development export (isServer = undefined) instead of node (isServer = true)
    ...(process.env.VITEST && {
      resolve: {
        conditions: ['development'],
      },
    }),
    test: {
      watch: false,
      projects: [
        {
          extends: true,
          test: {
            name: packageJson.name,
            dir: './tests',
            exclude: ['server'],
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
            server: {
              deps: {
                inline: [/@solidjs/, /@tanstack\/solid-store/],
              },
            },
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
  }
})

export default defineConfig((env) =>
  mergeConfig(
    config(env),
    tanstackViteConfig({
      tsconfigPath: './tsconfig.build.json',
      entry: [
        './src/index.tsx',
        './src/index.dev.tsx',
        './src/ssr/client.ts',
        './src/ssr/server.ts',
      ],
      srcDir: './src',
    }),
  ),
)
