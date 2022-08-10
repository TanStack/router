import path from 'path'
import { BranchConfig, Package } from './types'

// TODO: List your npm packages here.
export const packages: Package[] = [
  {
    name: '@tanstack/location-core',
    packageDir: 'location-core',
    srcDir: 'src',
    jsName: 'LocationCore',
    entryFile: 'src/index.ts',
    outputFile: 'location-core',
    globals: {},
  },
  {
    name: '@tanstack/react-location',
    packageDir: 'react-location',
    dependencies: ['@tanstack/location-core'],
    srcDir: 'src',
    jsName: 'ReactLocation',
    entryFile: 'src/index.tsx',
    outputFile: 'react-location',
    globals: {
      react: 'React',
    },
  },
  // {
  //   name: '@tanstack/react-location-lite-experimental',
  //   packageDir: 'react-location-lite-experimental',
  //   srcDir: 'src',
  //   jsName: 'TanstackReactLocationLiteExperimental',
  //   entryFile: 'src/index.tsx',
  //   outputFile: 'tanstack-react-location-lite-experimental',
  //   globals: { react: 'React' },
  // },
  // {
  //   name: '@tanstack/react-location-devtools',
  //   packageDir: 'react-location-devtools',
  //   peerDependencies: ['@tanstack/react-location'],
  //   srcDir: 'src',
  //   jsName: 'ReactLocationDevtools',
  //   entryFile: 'src/index.tsx',
  //   outputFile: 'react-location-devtools',
  //   globals: { react: 'React', '@tanstack/react-location': 'ReactLocation' },
  // },
  // {
  //   name: '@tanstack/react-location-elements-to-routes',
  //   packageDir: 'react-location-elements-to-routes',
  //   peerDependencies: ['@tanstack/react-location'],
  //   srcDir: 'src',
  //   jsName: 'ReactLocationElementsToRoutes',
  //   entryFile: 'src/index.tsx',
  //   outputFile: 'react-location-elements-to-routes',
  //   globals: { react: 'React', '@tanstack/react-location': 'ReactLocation' },
  // },
  // {
  //   name: '@tanstack/react-location-simple-cache',
  //   packageDir: 'react-location-simple-cache',
  //   peerDependencies: ['@tanstack/react-location'],
  //   srcDir: 'src',
  //   jsName: 'ReactLocationSimpleCache',
  //   entryFile: 'src/index.tsx',
  //   outputFile: 'react-location-simple-cache',
  //   globals: { react: 'React', '@tanstack/react-location': 'ReactLocation' },
  // },
  // {
  //   name: '@tanstack/react-location-rank-routes',
  //   packageDir: 'react-location-rank-routes',
  //   peerDependencies: ['@tanstack/react-location'],
  //   srcDir: 'src',
  //   jsName: 'ReactLocationRankRoutes',
  //   entryFile: 'src/index.tsx',
  //   outputFile: 'react-location-rank-routes',
  //   globals: { react: 'React', '@tanstack/react-location': 'ReactLocation' },
  // },
  // {
  //   name: '@tanstack/react-location-jsurl',
  //   packageDir: 'react-location-jsurl',
  //   peerDependencies: [],
  //   srcDir: 'src',
  //   jsName: 'ReactLocationJsurl',
  //   entryFile: 'src/index.tsx',
  //   outputFile: 'react-location-jsurl',
  //   globals: { react: 'React', '@tanstack/react-location': 'ReactLocation' },
  // },
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
