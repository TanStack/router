const { getDefaultConfig } = require('expo/metro-config')
const { withTanStackRouter } = require('@tanstack/router-plugin/metro')
const path = require('path')
const fs = require('fs')

const projectRoot = __dirname
const config = getDefaultConfig(projectRoot)
const monorepoRoot = path.resolve(projectRoot, '../../..')
const isMonorepo = fs.existsSync(path.join(monorepoRoot, 'pnpm-workspace.yaml'))

config.resolver.unstable_enablePackageExports = true

if (isMonorepo) {
  config.watchFolders = [monorepoRoot]

  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
  ]

  // Force a single React + RN copy (pnpm's nested layout can otherwise produce
  // duplicate React → "Invalid hook call" at runtime).
  const reactDir = path.dirname(
    require.resolve('react/package.json', { paths: [projectRoot] }),
  )
  const reactNativeDir = path.dirname(
    require.resolve('react-native/package.json', { paths: [projectRoot] }),
  )
  config.resolver.extraNodeModules = {
    react: reactDir,
    'react/jsx-runtime': path.join(reactDir, 'jsx-runtime'),
    'react/jsx-dev-runtime': path.join(reactDir, 'jsx-dev-runtime'),
    'react-native': reactNativeDir,
  }

  // Block any other react versions in the pnpm store from sneaking into the bundle
  // through transitive deps that resolve via absolute path (bypassing aliases).
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

module.exports = withTanStackRouter(config)
