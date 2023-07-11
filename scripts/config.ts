import path from 'path'
import { BranchConfig, Package } from './types'

// TODO: List your npm packages here.
export const packages: Package[] = [
  {
    name: '@tanstack/store',
    packageDir: 'store',
    srcDir: 'src',
    builds: [
      {
        jsName: 'Store',
        entryFile: 'src/index.ts',
        globals: {},
      },
    ],
  },
  {
    name: '@tanstack/react-store',
    packageDir: 'react-store',
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
    name: '@tanstack/router',
    packageDir: 'router',
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
    name: '@tanstack/router-devtools',
    packageDir: 'router-devtools',
    srcDir: 'src',
    builds: [
      {
        jsName: 'TanStackRouterDevtools',
        entryFile: 'src/index.tsx',
        globals: { react: 'React', '@tanstack/router': 'Router' },
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
        globals: { react: 'React', '@tanstack/router': 'Router' },
      },
      {
        jsName: 'TanStackStartReactServer',
        entryFile: 'src/server.tsx',
        globals: { react: 'React', '@tanstack/router': 'Router' },
        externals: ['stream', 'util', 'react-dom', 'react', 'react-dom/server'],
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
