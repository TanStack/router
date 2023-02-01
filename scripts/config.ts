import path from 'path'
import { BranchConfig, Package } from './types'

// TODO: List your npm packages here.
export const packages: Package[] = [
  {
    name: '@tanstack/store',
    packageDir: 'store',
    srcDir: 'src',
    jsName: 'Store',
    entryFile: 'src/index.ts',
    globals: {},
  },
  {
    name: '@tanstack/router',
    packageDir: 'router',
    srcDir: 'src',
    jsName: 'RouterCore',
    entryFile: 'src/index.ts',
    globals: {},
  },
  {
    name: '@tanstack/loaders',
    packageDir: 'loaders',
    srcDir: 'src',
    jsName: 'LoadersCore',
    entryFile: 'src/index.ts',
    globals: {},
  },
  {
    name: '@tanstack/actions',
    packageDir: 'actions',
    srcDir: 'src',
    jsName: 'ActionsCore',
    entryFile: 'src/index.ts',
    globals: {},
  },
  {
    name: '@tanstack/react-store',
    packageDir: 'react-store',
    srcDir: 'src',
    jsName: 'ReactLoaders',
    entryFile: 'src/index.tsx',
    globals: {
      react: 'React',
    },
  },
  {
    name: '@tanstack/react-router',
    packageDir: 'react-router',
    srcDir: 'src',
    jsName: 'ReactRouter',
    entryFile: 'src/index.tsx',
    globals: {
      react: 'React',
    },
  },
  {
    name: '@tanstack/react-actions',
    packageDir: 'react-actions',
    srcDir: 'src',
    jsName: 'ReactActions',
    entryFile: 'src/index.tsx',
    globals: {
      react: 'React',
    },
  },
  {
    name: '@tanstack/react-loaders',
    packageDir: 'react-loaders',
    srcDir: 'src',
    jsName: 'ReactLoaders',
    entryFile: 'src/index.tsx',
    globals: {
      react: 'React',
    },
  },
  {
    name: '@tanstack/react-router-devtools',
    packageDir: 'react-router-devtools',
    srcDir: 'src',
    jsName: 'ReactRouterDevtools',
    entryFile: 'src/index.tsx',
    globals: { react: 'React', '@tanstack/react-router': 'ReactRouter' },
  },
  {
    name: '@tanstack/solid-router',
    packageDir: 'solid-router',
    srcDir: 'src',
    jsName: 'SolidRouter',
    entryFile: 'src/index.tsx',
    globals: {},
  },
  {
    name: '@tanstack/router-cli',
    packageDir: 'router-cli',
    srcDir: 'src',
    jsName: 'RouterCli',
    entryFile: 'src/index.ts',
    // esm: false,
    umd: false,
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
