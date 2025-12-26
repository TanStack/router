// @ts-check

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { publish } from '@tanstack/config/publish'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

await publish({
  packages: [
    {
      name: '@tanstack/history',
      packageDir: 'packages/history',
    },
    {
      name: '@tanstack/router-core',
      packageDir: 'packages/router-core',
    },
    {
      name: '@tanstack/solid-router',
      packageDir: 'packages/solid-router',
    },
    {
      name: '@tanstack/react-router',
      packageDir: 'packages/react-router',
    },
    {
      name: '@tanstack/vue-router',
      packageDir: 'packages/vue-router',
    },
    {
      name: '@tanstack/solid-router-ssr-query',
      packageDir: 'packages/solid-router-ssr-query',
    },
    {
      name: '@tanstack/react-router-ssr-query',
      packageDir: 'packages/react-router-ssr-query',
    },
    {
      name: '@tanstack/vue-router-ssr-query',
      packageDir: 'packages/vue-router-ssr-query',
    },
    {
      name: '@tanstack/router-ssr-query-core',
      packageDir: 'packages/router-ssr-query-core',
    },
    {
      name: '@tanstack/zod-adapter',
      packageDir: 'packages/zod-adapter',
    },
    {
      name: '@tanstack/valibot-adapter',
      packageDir: 'packages/valibot-adapter',
    },
    {
      name: '@tanstack/arktype-adapter',
      packageDir: 'packages/arktype-adapter',
    },
    {
      name: '@tanstack/router-devtools',
      packageDir: 'packages/router-devtools',
    },
    {
      name: '@tanstack/solid-router-devtools',
      packageDir: 'packages/solid-router-devtools',
    },
    {
      name: '@tanstack/react-router-devtools',
      packageDir: 'packages/react-router-devtools',
    },
    {
      name: '@tanstack/vue-router-devtools',
      packageDir: 'packages/vue-router-devtools',
    },
    {
      name: '@tanstack/router-devtools-core',
      packageDir: 'packages/router-devtools-core',
    },
    {
      name: '@tanstack/router-generator',
      packageDir: 'packages/router-generator',
    },
    {
      name: '@tanstack/virtual-file-routes',
      packageDir: 'packages/virtual-file-routes',
    },
    {
      name: '@tanstack/router-cli',
      packageDir: 'packages/router-cli',
    },
    {
      name: '@tanstack/router-plugin',
      packageDir: 'packages/router-plugin',
    },
    {
      name: '@tanstack/router-vite-plugin',
      packageDir: 'packages/router-vite-plugin',
    },
    {
      name: '@tanstack/eslint-plugin-router',
      packageDir: 'packages/eslint-plugin-router',
    },
    {
      name: '@tanstack/solid-start',
      packageDir: 'packages/solid-start',
    },
    {
      name: '@tanstack/solid-start-client',
      packageDir: 'packages/solid-start-client',
    },
    {
      name: '@tanstack/solid-start-server',
      packageDir: 'packages/solid-start-server',
    },
    {
      name: '@tanstack/vue-start',
      packageDir: 'packages/vue-start',
    },
    {
      name: '@tanstack/vue-start-client',
      packageDir: 'packages/vue-start-client',
    },
    {
      name: '@tanstack/vue-start-server',
      packageDir: 'packages/vue-start-server',
    },
    {
      name: '@tanstack/start-client-core',
      packageDir: 'packages/start-client-core',
    },
    {
      name: '@tanstack/start-server-core',
      packageDir: 'packages/start-server-core',
    },
    {
      name: '@tanstack/start-storage-context',
      packageDir: 'packages/start-storage-context',
    },
    {
      name: '@tanstack/start-fn-stubs',
      packageDir: 'packages/start-fn-stubs',
    },
    {
      name: '@tanstack/react-start',
      packageDir: 'packages/react-start',
    },
    {
      name: '@tanstack/react-start-client',
      packageDir: 'packages/react-start-client',
    },
    {
      name: '@tanstack/react-start-server',
      packageDir: 'packages/react-start-server',
    },
    {
      name: '@tanstack/start-plugin-core',
      packageDir: 'packages/start-plugin-core',
    },
    {
      name: '@tanstack/start-static-server-functions',
      packageDir: 'packages/start-static-server-functions',
    },
    {
      name: '@tanstack/router-utils',
      packageDir: 'packages/router-utils',
    },
    {
      name: '@tanstack/nitro-v2-vite-plugin',
      packageDir: 'packages/nitro-v2-vite-plugin',
    },
  ],
  branchConfigs: {
    main: {
      prerelease: false,
    },
    alpha: {
      prerelease: true,
    },
    beta: {
      prerelease: true,
    },
  },
  rootDir: resolve(__dirname, '..'),
  branch: process.env.BRANCH,
  tag: process.env.TAG,
  ghToken: process.env.GH_TOKEN,
})

process.exit(0)
