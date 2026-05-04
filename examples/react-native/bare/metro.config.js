const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const { withTanStackRouter } = require('@tanstack/router-plugin/metro')
const path = require('path')
const fs = require('fs')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../../..')
const isMonorepo = fs.existsSync(path.join(monorepoRoot, 'pnpm-workspace.yaml'))

const defaultConfig = getDefaultConfig(projectRoot)

const config = {
  resolver: {
    unstable_enablePackageExports: true,
  },
}

if (isMonorepo) {
  // Watch the monorepo root so workspace package edits trigger reloads.
  config.watchFolders = [monorepoRoot]

  config.resolver = {
    ...config.resolver,
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    // Pin to a single React + RN copy so workspace deps can't pull duplicates
    // through pnpm's nested .pnpm layout (causes "Invalid hook call" otherwise).
    extraNodeModules: {
      react: path.dirname(
        require.resolve('react/package.json', { paths: [projectRoot] }),
      ),
      'react/jsx-runtime': path.join(
        path.dirname(
          require.resolve('react/package.json', { paths: [projectRoot] }),
        ),
        'jsx-runtime',
      ),
      'react/jsx-dev-runtime': path.join(
        path.dirname(
          require.resolve('react/package.json', { paths: [projectRoot] }),
        ),
        'jsx-dev-runtime',
      ),
      'react-native': path.dirname(
        require.resolve('react-native/package.json', { paths: [projectRoot] }),
      ),
    },
  }

  // Block any react copy in the pnpm store other than this example's pinned one,
  // so transitive deps that resolve react via absolute path can't sneak in a duplicate.
  const reactPkg = require('react/package.json')
  const exampleReactVersion = reactPkg.version
  const esc = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pnpmStore = path.join(monorepoRoot, 'node_modules', '.pnpm')

  config.resolver.blockList = [
    new RegExp(
      `^${esc(pnpmStore)}/react@(?!${esc(exampleReactVersion)})[^/]+/.*`,
    ),
  ]
}

module.exports = withTanStackRouter(mergeConfig(defaultConfig, config))
