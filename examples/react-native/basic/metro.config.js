const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../../..');

const config = getDefaultConfig(projectRoot);

// Watch the monorepo packages for changes
config.watchFolders = [monorepoRoot];

// Configure resolver for pnpm monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Disable package exports to avoid issues with workspace packages
config.resolver.unstable_enablePackageExports = false;

// Enable symlink support for pnpm
config.resolver.unstable_enableSymlinks = true;

// Use extraNodeModules to handle workspace packages
const workspacePackages = {
  '@tanstack/react-native-router': path.resolve(monorepoRoot, 'packages/react-native-router'),
  '@tanstack/router-core': path.resolve(monorepoRoot, 'packages/router-core'),
  '@tanstack/history': path.resolve(monorepoRoot, 'packages/history'),
};

config.resolver.extraNodeModules = new Proxy(workspacePackages, {
  get: (target, name) => {
    if (name in target) {
      return target[name];
    }
    // Fallback to project's node_modules for other packages
    return path.resolve(projectRoot, 'node_modules', name);
  },
});

module.exports = config;
