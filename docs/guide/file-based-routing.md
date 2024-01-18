---
title: File-Based Routes
---

Most of the TanStack Router documentation is written for file-based routing. This guide is mostly intended to help you understand in more detail how to configure file-based routing and the technical details behind how it works.

## Prerequisites

To enable file-based route generation, you'll need to install either the `@tanstack/router-vite-plugin` or `@tanstack/router-cli` package to generate your route tree file.

## Vite Plugin

The `@tanstack/router-vite-plugin` Vite plugin will **automatically generate your route configuration through Vite's dev and build processes**. It is the easiest way to use TanStack Router's route generation features.

```sh
npm install @tanstack/router-vite-plugin
```

### Vite Configuration

To enable the Vite plugin, add it to your `vite.config.ts` file:

```tsx
// vite.config.ts
import { defineConfig } from 'vite'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // ...,
    TanStackRouterVite(),
  ],
})
```

With the plugin enabled, Vite will now watch your configured `routesDirectory` and generate your route tree whenever a file is added, removed, or changed.

## Router CLI

If you are unable to use Vite, you can always use the Router CLI (which is what the Vite plugin uses) to generate your route configuration from your package dev/build scripts.

```sh
npm install @tanstack/router-cli
```

With the CLI installed, the following commands are made available via the `tsr` command

### `generate`

Generates the routes for a project based on the provided configuration.

**Usage:**

```bash
tsr generate
```

### `watch`

Continuously watches the specified directories and regenerates routes as needed.

**Usage:**

```bash
tsr watch
```

## Configuration

File-based routing comes with some sane defaults that should work for most projects:

```json
{
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts",
  "routeFileIgnorePrefix": "-",
  "quoteStyle": "single"
}
```

If these defaults work for your project, you don't need to configure anything at all! However, if you need to customize the configuration, you can do so by creating a `tsr.config.json` file in the root of your project directory.

- Place the `tsr.config.json` file in the root of your project directory.

### Options

The following options are available for configuration via the `tsr.config.json` file:

- **`routeFilePrefix`**
  - (Optional) If set, only route files and directories that start with this string will be considered for routing.
- **`routeFileIgnorePrefix`**
  - (Optional, **Defaults to `-`**) Route files and directories that start with this string will be ignored. By default this is set to `-` to allow for the use of directories to house related files that do not contain any route files.
- **`routesDirectory`**
  - (Required) The directory containing the routes relative to the cwd.
- **`generatedRouteTree`**
  - (Required) The path to the file where the generated route tree will be saved, relative to the cwd.
- **`quoteStyle`**
  - (Optional, **Defaults to `single`**) whether to use `single` or `double` quotes when writing the route ids in `new FileRoute()`
- **`disableTypes`**
  - (Optional, **Defaults to `false`**) whether to disable generating types for the route tree
  - If set to `true`, the generated route tree will not include any types.
  - If set to `true` and the `generatedRouteTree` file ends with `.ts` or `.tsx`, the generated route tree will be written as a `.js` file instead.

## File Naming Conventions

File-based routing requires that you follow a few simple file naming conventions to ensure that your routes are generated correctly. The concepts these conventions enable are covered in detail in the [Route Trees & Nesting](./guide/route-trees.md) guide.

- **`__root.tsx`**
  - The root route file must be named `__root.tsx` and must be placed in the root of the configured `routesDirectory`.
- **`.` Separator**
  - Routes can use the `.` character to denote a nested route. For example, `blog.post` will be generated as a child of `blog`.
- **`$` Token**
  - Routes segments with the `$` token are parameterized and will extract the value from the URL pathname as a route `param`.
- **`_` Prefix**
  - Routes segments with the `_` prefix are considered layout-routes and will not be used when matching its child routes against the URL pathname.
- **`_` Suffix**
  - Routes segments with the `_` suffix exclude the route from being nested under any parent routes.
- **`index` Token**
  - Routes segments ending with the `index` token (but before any file types) will be used to match the parent route when the URL pathname matches the parent route exactly.
- **`.route.tsx` File Type**
  - When using directories to organize your routes, the `route` suffix can be used to create a route file at the directory's path. For example, `blog/post/route.tsx` will be used at the route file for the `/blog/post` route.
- **`.component.tsx` File Type**
- **`.errorComponent.tsx` File Type**
- **`.pendingComponent.tsx` File Type**
- **`.loader.tsx` File Type**
  - Each of these suffixes can be used to code-split components or loaders for a route. For example, `blog.post.component.tsx` will be used as the component for the `blog.post` route.
