// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { defineRouteModuleBuildTests } from '../../start-plugin-core/tests/route-module-build'

// Builds a Start application that mounts a route module with this package's
// public Vite and Rsbuild plugins, then runs its server and client output.
defineRouteModuleBuildTests({
  framework: 'vue',
  frameworkPackage: 'vue',
  frameworkPlugins: ['@vitejs/plugin-vue', '@vitejs/plugin-vue-jsx'],
  pluginOptions: '',
  packageRoot: fileURLToPath(new URL('..', import.meta.url)),
})
