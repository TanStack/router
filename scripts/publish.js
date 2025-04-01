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
      name: '@tanstack/react-router-with-query',
      packageDir: 'packages/react-router-with-query',
    },
    {
      name: '@tanstack/solid-router-with-query',
      packageDir: 'packages/solid-router-with-query',
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
      name: '@tanstack/directive-functions-plugin',
      packageDir: 'packages/directive-functions-plugin',
    },
    {
      name: '@tanstack/server-functions-plugin',
      packageDir: 'packages/server-functions-plugin',
    },
    {
      name: '@tanstack/create-router',
      packageDir: 'packages/create-router',
    },
    {
      name: '@tanstack/eslint-plugin-router',
      packageDir: 'packages/eslint-plugin-router',
    },
    {
      name: '@tanstack/create-start',
      packageDir: 'packages/create-start',
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
      name: '@tanstack/solid-start-config',
      packageDir: 'packages/solid-start-config',
    },
    {
      name: '@tanstack/solid-start-plugin',
      packageDir: 'packages/solid-start-plugin',
    },
    {
      name: '@tanstack/solid-start-router-manifest',
      packageDir: 'packages/solid-start-router-manifest',
    },
    {
      name: '@tanstack/solid-start-server',
      packageDir: 'packages/solid-start-server',
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
      name: '@tanstack/react-start',
      packageDir: 'packages/react-start',
    },
    {
      name: '@tanstack/react-start-plugin',
      packageDir: 'packages/react-start-plugin',
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
      name: '@tanstack/start-config',
      packageDir: 'packages/start-config',
    },
    {
      name: '@tanstack/react-start-config',
      packageDir: 'packages/react-start-config',
    },
    {
      name: '@tanstack/start-api-routes',
      packageDir: 'packages/start-api-routes',
    },
    {
      name: '@tanstack/start-server-functions-fetcher',
      packageDir: 'packages/start-server-functions-fetcher',
    },
    {
      name: '@tanstack/start-server-functions-handler',
      packageDir: 'packages/start-server-functions-handler',
    },
    {
      name: '@tanstack/start-server-functions-client',
      packageDir: 'packages/start-server-functions-client',
    },
    {
      name: '@tanstack/start-server-functions-ssr',
      packageDir: 'packages/start-server-functions-ssr',
    },
    {
      name: '@tanstack/start-server-functions-server',
      packageDir: 'packages/start-server-functions-server',
    },
    {
      name: '@tanstack/react-start-router-manifest',
      packageDir: 'packages/react-start-router-manifest',
    },
    {
      name: '@tanstack/start',
      packageDir: 'packages/start',
    },
    {
      name: '@tanstack/router-utils',
      packageDir: 'packages/router-utils',
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
