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
  },
  {
    name: '@tanstack/react-router',
    packageDir: 'packages/react-router',
  },
  {
    name: '@tanstack/router-devtools',
    packageDir: 'packages/router-devtools',
  },
  {
    name: '@tanstack/router-generator',
    packageDir: 'packages/router-generator',
  },
  {
    name: '@tanstack/router-cli',
    packageDir: 'packages/router-cli',
  },
  {
    name: '@tanstack/router-vite-plugin',
    packageDir: 'packages/router-vite-plugin',
  },
  {
    name: '@tanstack/react-cross-context',
    packageDir: 'packages/react-cross-context',
  },
  {
    name: '@tanstack/react-router-server',
    packageDir: 'packages/react-router-server',
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
