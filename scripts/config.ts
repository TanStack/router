import path from 'path'
import { BranchConfig, Package } from './types'

// TODO: List your npm packages here.
export const packages: Package[] = [
  {
    name: '@tanstack/router-core',
    packageDir: 'router-core',
    srcDir: 'src',
    builds: [
      {
        jsName: 'RouterCore',
        entryFile: 'src/index.ts',
        globals: {},
      },
    ],
  },
  {
    name: '@tanstack/loaders',
    packageDir: 'loaders',
    srcDir: 'src',
    builds: [
      {
        jsName: 'LoadersCore',
        entryFile: 'src/index.ts',
        globals: {},
      },
    ],
  },
  {
    name: '@tanstack/react-loaders',
    packageDir: 'react-loaders',
    srcDir: 'src',
    builds: [
      {
        jsName: 'ReactLoaders',
        entryFile: 'src/index.tsx',
        globals: {
          react: 'React',
        },
      },
    ],
  },
  {
    name: '@tanstack/actions',
    packageDir: 'actions',
    srcDir: 'src',
    builds: [
      {
        jsName: 'ActionsCore',
        entryFile: 'src/index.ts',
        globals: {},
      },
    ],
  },
  {
    name: '@tanstack/react-actions',
    packageDir: 'react-actions',
    srcDir: 'src',
    builds: [
      {
        jsName: 'ReactActions',
        entryFile: 'src/index.tsx',
        globals: {
          react: 'React',
        },
      },
    ],
  },
  {
    name: '@tanstack/react-router',
    packageDir: 'react-router',
    srcDir: 'src',
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
    packageDir: 'router-devtools',
    srcDir: 'src',
    builds: [
      {
        jsName: 'TanStackRouterDevtools',
        entryFile: 'src/index.tsx',
        globals: { react: 'React', '@tanstack/react-router': 'ReactRouter' },
      },
    ],
  },
  {
    name: '@tanstack/react-start',
    packageDir: 'react-start',
    srcDir: 'src',
    builds: [
      {
        jsName: 'TanStackStartReactClient',
        entryFile: 'src/client.tsx',
        globals: { react: 'React', '@tanstack/react-router': 'ReactRouter' },
      },
      {
        jsName: 'TanStackStartReactServer',
        entryFile: 'src/server.tsx',
        globals: { react: 'React', '@tanstack/react-router': 'ReactRouter' },
        externals: ['stream', 'util', 'react-dom', 'react', 'react-dom/server'],
      },
    ],
  },
  {
    name: '@tanstack/router-cli',
    packageDir: 'router-cli',
    srcDir: 'src',
    builds: [
      {
        jsName: 'TanStackRouterCli',
        entryFile: 'src/index.ts',
        // globals: { react: 'React', '@tanstack/react-router': 'ReactRouter' },
        // externals: ['stream', 'util', 'react-dom', 'react', 'react-dom/server'],
        esm: false,
        umd: false,
        // externals: [(d) => console.log(d)],
      },
    ],
  },
]

export const latestBranch = 'main'

export const branchConfigs: Record<string, BranchConfig> = {
  main: {
    prerelease: false,
    ghRelease: true,
  },
  next: {
    prerelease: true,
    ghRelease: true,
  },
  beta: {
    prerelease: true,
    ghRelease: true,
  },
  alpha: {
    prerelease: true,
    ghRelease: true,
  },
}

export const rootDir = path.resolve(__dirname, '..')
export const examplesDirs = [
  'examples/react',
  // 'examples/solid',
  // 'examples/svelte',
  // 'examples/vue',
]
