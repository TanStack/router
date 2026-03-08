const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const fs = require('fs')

const projectRoot = __dirname
const config = getDefaultConfig(projectRoot)

// Enable package.json exports field support
config.resolver.unstable_enablePackageExports = true

// Detect if we're running inside the TanStack Router monorepo
const monorepoRoot = path.resolve(projectRoot, '../../..')
const isMonorepo = fs.existsSync(path.join(monorepoRoot, 'pnpm-workspace.yaml'))

if (isMonorepo) {
  // Watch the monorepo root so edits to workspace packages trigger reloads
  config.watchFolders = [monorepoRoot]

  // Let Metro find modules in both project and monorepo node_modules
  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
  ]

  // pnpm uses symlinks — tell Metro to follow them
  config.resolver.unstable_enableSymlinks = true

  // Force a single copy of React and React Native from the example's node_modules
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

  // Block ALL react copies from the pnpm store except the one the example uses.
  // pnpm stores packages at node_modules/.pnpm/react@<version>/...
  // We need to block every version that isn't the example's pinned version.
  const reactPkg = require('react/package.json')
  const exampleReactVersion = reactPkg.version
  const esc = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pnpmStore = path.join(monorepoRoot, 'node_modules', '.pnpm')

  config.resolver.blockList = [
    // Block react@<other versions> in the pnpm store
    new RegExp(
      `^${esc(pnpmStore)}/react@(?!${esc(exampleReactVersion)})[^/]+/.*`,
    ),
    // Block react-native from monorepo root (flat path)
    new RegExp(`^${esc(monorepoRoot)}/node_modules/react-native/.*`),
    // Block react from monorepo root (flat path)
    new RegExp(`^${esc(monorepoRoot)}/node_modules/react/.*`),
  ]
}

module.exports = config
