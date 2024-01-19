// @ts-check

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * List your npm packages here. The first package will be used as the versioner.
 * @type {import('./types').Package[]}
 */
export const packages = [
  {
    name: '@tanstack/history',
    packageDir: 'packages/history',
    builds: [
      {
        jsName: 'TanStackHistory',
        entryFile: 'src/index.ts',
        globals: {},
      },
    ],
  },
  {
    name: '@tanstack/react-router',
    packageDir: 'packages/react-router',
    builds: [
      {
        jsName: 'ReactRouter',
        entryFile: 'src/index.tsx',
        globals: {
          react: 'React',
        },
      },
    ],
  },
  {
    name: '@tanstack/router-devtools',
    packageDir: 'packages/router-devtools',
    builds: [
      {
        jsName: 'TanStackRouterDevtools',
        entryFile: 'src/index.tsx',
        globals: { react: 'React', '@tanstack/react-router': 'ReactRouter' },
      },
    ],
  },
  {
    name: '@tanstack/router-generator',
    packageDir: 'packages/router-generator',
    builds: [
      {
        jsName: 'TanStackRouterGenerator',
        entryFile: 'src/index.ts',
        // esm: false,
        // cjs: false,
        umd: false,
      },
    ],
  },
  {
    name: '@tanstack/router-cli',
    packageDir: 'packages/router-cli',
    builds: [
      {
        jsName: 'TanStackRouterCli',
        entryFile: 'src/index.ts',
        esm: false,
        umd: false,
      },
    ],
  },
  {
    name: '@tanstack/router-vite-plugin',
    packageDir: 'packages/router-vite-plugin',
    builds: [
      {
        jsName: 'TanStackRouterVitePlugin',
        entryFile: 'src/index.ts',
        // esm: false,
        // cjs: false,
        umd: false,
      },
    ],
  },
  {
    name: '@tanstack/react-cross-context',
    packageDir: 'packages/react-cross-context',
    builds: [
      {
        jsName: 'ReactCrossContext',
        entryFile: 'src/index.ts',
      },
    ],
  },
  {
    name: '@tanstack/react-router-server',
    packageDir: 'packages/react-router-server',
    builds: [
      {
        jsName: 'TanStackRouterServer',
        entryFile: 'src/server.tsx',
      },
      {
        jsName: 'TanStackRouterServerClient',
        entryFile: 'src/client.tsx',
      },
    ],
  },
]

/**
 * Contains config for publishable branches.
 * @type {Record<string, import('./types').BranchConfig>}
 */
export const branchConfigs = {
  main: {
    prerelease: false,
  },
  next: {
    prerelease: true,
  },
  beta: {
    prerelease: true,
  },
  alpha: {
    prerelease: true,
  },
}

const __dirname = fileURLToPath(new URL('.', import.meta.url))
export const rootDir = resolve(__dirname, '..')
