import path from 'path'
import { BranchConfig, Package } from './types'

// TODO: List your npm packages here.
export const packages: Package[] = [
  {
    name: '@tanstack/router-core',
    packageDir: 'router-core',
    srcDir: 'src',
    jsName: 'LocationCore',
    entryFile: 'src/index.ts',
    outputFile: 'router-core',
    globals: {},
  },
  {
    name: '@tanstack/react-router',
    packageDir: 'react-router',
    dependencies: ['@tanstack/router-core'],
    srcDir: 'src',
    jsName: 'ReactLocation',
    entryFile: 'src/index.tsx',
    outputFile: 'react-router',
    globals: {
      react: 'React',
    },
  },
  {
    name: '@tanstack/router-devtools',
    packageDir: 'react-router-devtools',
    peerDependencies: ['@tanstack/react-router'],
    srcDir: 'src',
    jsName: 'ReactLocationDevtools',
    entryFile: 'src/index.tsx',
    outputFile: 'react-router-devtools',
    globals: { react: 'React', '@tanstack/react-router': 'ReactLocation' },
  },
  {
    name: '@tanstack/router-elements-to-routes',
    packageDir: 'react-router-elements-to-routes',
    peerDependencies: ['@tanstack/react-router'],
    srcDir: 'src',
    jsName: 'ReactLocationElementsToRoutes',
    entryFile: 'src/index.tsx',
    outputFile: 'react-router-elements-to-routes',
    globals: { react: 'React', '@tanstack/react-router': 'ReactLocation' },
  },
  {
    name: '@tanstack/router-rank-routes',
    packageDir: 'react-router-rank-routes',
    peerDependencies: ['@tanstack/react-router'],
    srcDir: 'src',
    jsName: 'ReactLocationRankRoutes',
    entryFile: 'src/index.tsx',
    outputFile: 'react-router-rank-routes',
    globals: { react: 'React', '@tanstack/react-router': 'ReactLocation' },
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
  'examples/solid',
  'examples/svelte',
  'examples/vue',
]
