const { getDefaultConfig } = require('expo/metro-config')
const { withTanStackRouter } = require('@tanstack/router-plugin/metro')
const path = require('path')
const fs = require('fs')

const projectRoot = __dirname
const config = getDefaultConfig(projectRoot)
const monorepoRoot = path.resolve(projectRoot, '../../..')
const isMonorepo = fs.existsSync(path.join(monorepoRoot, 'pnpm-workspace.yaml'))

if (isMonorepo) {
  // Watch the monorepo root so edits to workspace packages trigger reloads.
  // (Set EXPO_NO_METRO_WORKSPACE_ROOT=1 when running expo to keep bundle URLs
  // rooted at the project, otherwise Expo serves them at the workspace path
  // which Metro can't resolve back to the entry.)
  config.watchFolders = [monorepoRoot]

  // Let Metro find modules in both project and monorepo node_modules
  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
  ]

  // Force a single copy of React + React Native — without this, workspace
  // packages can pull in their own copy via pnpm's nested .pnpm layout,
  // which manifests as "Invalid hook call" / "React.useEffect isn't a function"
  // at runtime (multiple React instances).
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

  // Block every other react copy in the pnpm store so transitive deps that
  // bypass the extraNodeModules alias (by absolute import path) can't pull
  // in a second copy. Pattern: node_modules/.pnpm/react@<version>/...
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

config.resolver.unstable_enablePackageExports = true

module.exports = withTanStackRouter(config)
