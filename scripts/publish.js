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
      name: '@tanstack/react-router',
      packageDir: 'packages/react-router',
    },
    {
      name: '@tanstack/react-router-with-query',
      packageDir: 'packages/react-router-with-query',
    },
    {
      name: '@tanstack/router-zod-adapter',
      packageDir: 'packages/router-zod-adapter',
    },
    {
      name: '@tanstack/router-valibot-adapter',
      packageDir: 'packages/router-valibot-adapter',
    },
    {
      name: '@tanstack/router-arktype-adapter',
      packageDir: 'packages/router-arktype-adapter',
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
      name: '@tanstack/start',
      packageDir: 'packages/start',
    },
    {
      name: '@tanstack/start-vite-plugin',
      packageDir: 'packages/start-vite-plugin',
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
