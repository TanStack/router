const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../../..')

const config = getDefaultConfig(projectRoot)

// 1. Set the project root explicitly - this is where our app's entry point lives
config.projectRoot = projectRoot

// 2. Watch the monorepo root for package changes
//    This enables live reloading when editing workspace packages
config.watchFolders = [monorepoRoot]

// 3. Configure node_modules resolution for pnpm
//    Metro needs to know about both project and monorepo node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// 4. Enable symlink support for pnpm workspace:* dependencies
config.resolver.unstable_enableSymlinks = true

// 5. Enable package.json exports field support
config.resolver.unstable_enablePackageExports = true

// 6. Dedupe React and React Native - ensure only one copy from the example's node_modules
const reactPkg = require.resolve('react/package.json', { paths: [projectRoot] })
const reactDir = path.dirname(reactPkg)
const reactNativePkg = require.resolve('react-native/package.json', {
  paths: [projectRoot],
})
const reactNativeDir = path.dirname(reactNativePkg)

config.resolver.extraNodeModules = {
  react: reactDir,
  'react/jsx-runtime': path.join(reactDir, 'jsx-runtime'),
  'react/jsx-dev-runtime': path.join(reactDir, 'jsx-dev-runtime'),
  'react-native': reactNativeDir,
}

// 7. Block ALL react/react-native from monorepo root - force use of example's versions
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
config.resolver.blockList = [
  new RegExp(`^${escapeRegex(monorepoRoot)}/node_modules/react/.*`),
  new RegExp(`^${escapeRegex(monorepoRoot)}/node_modules/react-native/.*`),
  new RegExp(
    `^${escapeRegex(monorepoRoot)}/node_modules/\\.pnpm/react@(?!19\\.1\\.0).*`,
  ),
  new RegExp(
    `^${escapeRegex(monorepoRoot)}/node_modules/\\.pnpm/react-native@(?!0\\.81).*`,
  ),
]

module.exports = config
