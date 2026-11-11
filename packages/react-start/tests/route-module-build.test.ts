// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { defineRouteModuleBuildTests } from '../../start-plugin-core/tests/route-module-build'

// Builds a Start application that mounts a route module with this package's
// public Vite and Rsbuild plugins, then runs its server and client output.
defineRouteModuleBuildTests({
  framework: 'react',
  frameworkPackage: 'react',
  frameworkPlugins: ['@vitejs/plugin-react'],
  pluginOptions: '',
  packageRoot: fileURLToPath(new URL('..', import.meta.url)),
})
