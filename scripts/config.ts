import path from 'path'
import { BranchConfig, Package } from './types'

// TODO: List your npm packages here. The first package will be used as the versioner.
export const packages: Package[] = [
  { name: '@tanstack/react-location', srcDir: 'packages/react-location/src' },
  {
    name: '@tanstack/react-location-lite-experimental',
    srcDir: 'packages/react-location-lite-experimental/src',
  },
  {
    name: '@tanstack/react-location-devtools',
    srcDir: 'packages/react-location-devtools/src',
    peerDependencies: ['@tanstack/react-location'],
  },
  {
    name: '@tanstack/react-location-elements-to-routes',
    srcDir: 'packages/react-location-elements-to-routes/src',
    peerDependencies: ['@tanstack/react-location'],
  },
  {
    name: '@tanstack/react-location-simple-cache',
    srcDir: 'packages/react-location-simple-cache/src',
    peerDependencies: ['@tanstack/react-location'],
  },
  {
    name: '@tanstack/react-location-rank-routes',
    srcDir: 'packages/react-location-rank-routes/src',
    peerDependencies: ['@tanstack/react-location'],
  },
  {
    name: '@tanstack/react-location-jsurl',
    srcDir: 'packages/react-location-jsurl/src',
    peerDependencies: [],
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
export const examplesDir = path.resolve(rootDir, 'examples')
