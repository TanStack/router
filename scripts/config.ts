import path from 'path'
import { BranchConfig, Package } from './types'

export const packages: Package[] = [
  {
    name: '@tanstack/history',
    packageDir: 'history',
    srcDir: 'src',
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
  {
    name: '@tanstack/react-router-server',
    packageDir: 'react-router-server',
    srcDir: 'src',
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
