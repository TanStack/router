---
name: router-installation
description: |
  Installation and bundler setup for TanStack Router.
  Covers Vite, Webpack, Rspack, ESBuild, and manual CLI configuration.
---

# Installation

TanStack Router setup for different bundlers and configurations.

## Routing Table

| Reference      | File                      | When to Use                                   |
| -------------- | ------------------------- | --------------------------------------------- |
| **Vite**       | `references/vite.md`      | Setting up with Vite (recommended)            |
| **Webpack**    | `references/webpack.md`   | Setting up with Webpack                       |
| **Rspack**     | `references/rspack.md`    | Setting up with Rspack/Rsbuild                |
| **ESBuild**    | `references/esbuild.md`   | Setting up with ESBuild                       |
| **Router CLI** | `references/cli.md`       | Using standalone CLI for route generation     |
| **Migration**  | `references/migration.md` | Migrating from React Router or React Location |

## Quick Install

```bash
# Core packages
npm install @tanstack/react-router @tanstack/react-router-devtools

# Bundler plugin (for file-based routing)
npm install -D @tanstack/router-plugin
```

## Bundler Plugin Usage

```ts
// Vite
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// Webpack
import { tanstackRouter } from '@tanstack/router-plugin/webpack'

// Rspack
import { tanstackRouter } from '@tanstack/router-plugin/rspack'

// ESBuild
import { tanstackRouter } from '@tanstack/router-plugin/esbuild'
```

## Plugin Configuration

```ts
tanstackRouter({
  target: 'react', // 'react' | 'solid'
  autoCodeSplitting: true, // Automatic code splitting
  routesDirectory: './src/routes',
  generatedRouteTree: './src/routeTree.gen.ts',
  routeFileIgnorePrefix: '-',
  quoteStyle: 'single',
})
```

## VSCode Settings

Exclude generated route tree from linting and search:

```json
{
  "files.readonlyInclude": { "**/routeTree.gen.ts": true },
  "files.watcherExclude": { "**/routeTree.gen.ts": true },
  "search.exclude": { "**/routeTree.gen.ts": true }
}
```
