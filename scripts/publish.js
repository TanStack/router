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
      name: '@tanstack/react-router',
      packageDir: 'packages/react-router',
    },
    {
      name: '@tanstack/solid-router',
      packageDir: 'packages/solid-router',
    },
    {
      name: '@tanstack/react-router-with-query',
      packageDir: 'packages/react-router-with-query',
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
      name: '@tanstack/react-cross-context',
      packageDir: 'packages/react-cross-context',
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
      name: '@tanstack/start-plugin',
      packageDir: 'packages/start-plugin',
    },
    {
      name: '@tanstack/start',
      packageDir: 'packages/start',
    },
    {
      name: '@tanstack/start-client',
      packageDir: 'packages/start-client',
    },
    {
      name: '@tanstack/start-server',
      packageDir: 'packages/start-server',
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
      name: '@tanstack/start-config',
      packageDir: 'packages/start-config',
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
      name: '@tanstack/start-router-manifest',
      packageDir: 'packages/start-router-manifest',
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
