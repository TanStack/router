---
title: File-Based Routes
---

Most of the TanStack Router documentation is written for file-based routing. This guide is mostly intended to help you understand in more detail how to configure file-based routing and the technical details behind how it works.

## Prerequisites

To enable file-based routing, you'll need to be using React with a supported bundler. TanStack Router currently has support for the following bundlers:

- Vite
- Rspack/Rsbuild
- Webpack
- Others??? (let us know if you'd like to see support for a specific bundler)

If your bundler is not yet supported, you can reach out to us on Discord or GitHub to let us know. Till then, fear not! You can still use the use the [`@tanstack/router-cli`](#configuration-with-the-tanstack-router-cli) package to generate your route tree file.

## Installation

To get started with file-based routing, you'll need to configure your project's bundler to use the TanStack Router Plugin or the TanStack Router CLI.

If you are using TanStack Router's file-based routing through a bundler, the plugin will **automatically generate your route configuration through your bundler's dev and build processes**. It is the easiest way to use TanStack Router's route generation features.

### Configuration with Vite

To use file-based routing with **Vite**, you'll need to install the `@tanstack/router-plugin` package.

```sh
npm install -D @tanstack/router-plugin
```

Once installed, you'll need to add the plugin to your Vite configuration.

```tsx
// vite.config.ts
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    viteReact(),
    // ...
  ],
})
```

Or, you can clone our [Quickstart Vite example](https://github.com/TanStack/router/tree/main/examples/react/quickstart-file-based) and get started.

> [!WARNING]
> If you are using the older `@tanstack/router-vite-plugin` package, you can still continue to use it, as it will be aliased to the `@tanstack/router-plugin/vite` package. However, we would recommend using the `@tanstack/router-plugin` package directly.

### Configuration with Rspack/Rsbuild

To use file-based routing with **Rspack** or **Rsbuild**, you'll need to install the `@tanstack/router-plugin` package.

```sh
npm install -D @tanstack/router-plugin
```

Once installed, you'll need to add the plugin to your configuration.

```tsx
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { TanStackRouterRspack } from '@tanstack/router-plugin/rspack'

export default defineConfig({
  plugins: [pluginReact()],
  tools: {
    rspack: {
      plugins: [TanStackRouterRspack()],
    },
  },
})
```

Or, you can clone our [Quickstart Rspack/Rsbuild example](https://github.com/TanStack/router/tree/main/examples/react/quickstart-rspack-file-based) and get started.

### Configuration with Webpack

To use file-based routing with **Webpack**, you'll need to install the `@tanstack/router-plugin` package.

```sh
npm install -D @tanstack/router-plugin
```

Once installed, you'll need to add the plugin to your configuration.

```tsx
// webpack.config.ts
import { TanStackRouterWebpack } from '@tanstack/router-plugin/webpack'

export default {
  plugins: [TanStackRouterWebpack()],
}
```

Or, you can clone our [Quickstart Webpack example](https://github.com/TanStack/router/tree/main/examples/react/quickstart-webpack-file-based) and get started.

### Configuration with the TanStack Router CLI

To use file-based routing with the TanStack Router CLI, you'll need to install the `@tanstack/router-cli` package.

```sh
npm install -D @tanstack/router-cli
```

Once installed, you'll need to amend your your scripts in your `package.json` for the CLI to `watch` and `generate` files.

```json
{
  "scripts": {
    "generate-routes": "tsr generate",
    "watch-routes": "tsr watch",
    "build": "npm run generate-routes && ...",
    "dev": "npm run watch-routes && ..."
  }
}
```

With the CLI installed, the following commands are made available via the `tsr` command

#### Using the `generate` command

Generates the routes for a project based on the provided configuration.

```sh
tsr generate
```

#### Using the `watch` command

Continuously watches the specified directories and regenerates routes as needed.

**Usage:**

```sh
tsr watch
```

With file-based routing enabled, whenever you start your application in development mode, TanStack Router will watch your configured `routesDirectory` and generate your route tree whenever a file is added, removed, or changed.

### Disabling the TanStack Router Plugin during tests

> ⚠️ Note: To disable the plugin when running tests via vitest, you can conditionally add it based on the current `NODE_ENV`:

```tsx
// vite.config.ts
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'

// vitest automatically sets NODE_ENV to 'test' when running tests
const isTest = process.env.NODE_ENV === 'test'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    !isTest && TanStackRouterVite(),
    viteReact(),
    // ...
  ],
})
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

> [!IMPORTANT]
> Do not set the `routeFilePrefix`, `routeFileIgnorePrefix`, or `routeFileIgnorePattern` options, to match any of the tokens used in the [file-naming conventions](#file-naming-conventions) section.

- **`routeFilePrefix`**
  - (Optional) If set, only route files and directories that start with this string will be considered for routing.
- **`routeFileIgnorePrefix`**
  - (Optional, **Defaults to `-`**) Route files and directories that start with this string will be ignored. By default this is set to `-` to allow for the use of directories to house related files that do not contain any route files.
- **`routeFileIgnorePattern`**
  - (Optional) Ignore specific files and directories in the route directory. It can be used in regular expression format. For example, `.((css|const).ts)|test-page` will ignore files / directories with names containing `.css.ts`, `.const.ts` or `test-page`.
- **`routesDirectory`**
  - (Required) The directory containing the routes relative to the cwd.
- **`generatedRouteTree`**
  - (Required) The path to the file where the generated route tree will be saved, relative to the cwd.
- **`quoteStyle`**
  - (Optional, **Defaults to `single`**) whether to use `single` or `double` quotes when formatting the generated route tree file.`
- **`semicolons`**
  - (Optional, **Defaults to `false`**) whether to use semicolons in the generated route tree file.
- **`disableTypes`**
  - (Optional, **Defaults to `false`**) whether to disable generating types for the route tree
  - If set to `true`, the generated route tree will not include any types.
  - If set to `true` and the `generatedRouteTree` file ends with `.ts` or `.tsx`, the generated route tree will be written as a `.js` file instead.
- **`addExtensions`**
  - (Optional, **Defaults to `false`**) add file extensions to the route names in the generated route tree
- **`disableLogging`**
  - (Optional, **Defaults to `false`**) disables logging for the route generation process
- **`disableManifestGeneration**
  - (Optional, **Defaults to `false`**) disables generating the route tree manifest
- **`routeTreeFileHeader`**

  - (Optional) An array of strings to prepend to the generated route tree file content.
  - Default:
  - ```
    [
      '/* prettier-ignore-start */',
      '/* eslint-disable */',
      '// @ts-nocheck',
      '// noinspection JSUnusedGlobalSymbols'
    ]
    ```

- **`routeTreeFileFooter`**
  - (Optional) An array of strings to append to the generated route tree file content.
  - Default:
  - ```
    [
      '/* prettier-ignore-end */'
    ]
    ```
- **`experimental.enableCodeSplitting`** ⚠️
  - (Optional, **Defaults to `false`**)
  - If set to `true`, all non-critical route configuration items will be automatically code-split.
  - See the [using automatic code-splitting](./code-splitting.md#using-automatic-code-splitting) guide.

## File Naming Conventions

File-based routing requires that you follow a few simple file naming conventions to ensure that your routes are generated correctly. The concepts these conventions enable are covered in detail in the [Route Trees & Nesting](./route-trees.md) guide.

> **💡 Remember:** The file-naming conventions for your project could be affected by what [options](#options) are configured in your `tsr.config.json`. By default, the `routeFileIgnorePrefix` option is set to `-`, as such files and directories starting with `-` will not be considered for routing.

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
- **`(folder)` folder name pattern**:
  - A folder that matches this pattern is treated as a **route group** which prevents this folder to be included in the route's URL path.
- **`index` Token**
  - Routes segments ending with the `index` token (but before any file types) will be used to match the parent route when the URL pathname matches the parent route exactly.
- **`.route.tsx` File Type**
  - When using directories to organize your routes, the `route` suffix can be used to create a route file at the directory's path. For example, `blog.post.route.tsx` or `blog/post/route.tsx` can be used at the route file for the `/blog/post` route.
- **`.lazy.tsx` File Type**
  - The `lazy` suffix can be used to code-split components for a route. For example, `blog.post.lazy.tsx` will be used as the component for the `blog.post` route.
- **`.component.tsx` File Type (⚠️ deprecated)**
- **`.errorComponent.tsx` File Type (⚠️ deprecated)**
- **`.pendingComponent.tsx` File Type (⚠️ deprecated)**
- **`.loader.tsx` File Type (⚠️ deprecated)**
  - Each of these suffixes can be used to code-split components or loaders for a route. For example, `blog.post.component.tsx` will be used as the component for the `blog.post` route.

## Route Inclusion / Exclusion

Via the `routeFilePrefix` and `routeFileIgnorePrefix` options, the CLI can be configured to only include files and directories that start with a specific prefix, or to ignore files and directories that start with a specific prefix. This is especially useful when mixing non-route files with route files in the same directory, or when using a flat structure and wanting to exclude certain files from routing.

### Route Inclusion Example

To only consider files and directories that start with `~` for routing, the following configuration can be used:

> 🧠 A prefix of `~` is generally recommended when using this option. Not only is this symbol typically associated with the home-folder navigation in unix-based systems, but it is also a valid character for use in filenames and urls that will typically force the file to the top of a directory for easier visual indication of routes.

```json
{
  "routeFilePrefix": "~",
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts"
}
```

With this configuration, the `Posts.tsx`, `Post.tsx`, and `PostEditor.tsx` files will be ignored during route generation.

```
~__root.tsx
~posts.tsx
~posts
  ~index.tsx
  ~$postId.tsx
  ~$postId
    ~edit.tsx
    PostEditor.tsx
  Post.tsx
Posts.tsx
```

It's also common to use directories to house related files that do not contain any route files:

```
~__root.tsx
~posts.tsx
~posts
  ~index.tsx
  ~$postId.tsx
  ~$postId
    ~edit.tsx
    components
      PostEditor.tsx
  components
    Post.tsx
components
  Posts.tsx
utils
  Posts.tsx
```

### Route Exclusion Example

To ignore files and directories that start with `-` for routing, the following configuration can be used:

> 🧠 A prefix of `-` is generally recommended when using this option since the minus symbol is typically associated with removal or exclusion.

```json
{
  "routeFileIgnorePrefix": "-",
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts"
}
```

With this configuration, the `Posts.tsx`, `Post.tsx`, and `PostEditor.tsx` files will be ignored during route generation.

```
__root.tsx
posts.tsx
posts
  index.tsx
  $postId.tsx
  $postId
    edit.tsx
    -PostEditor.tsx
  -Post.tsx
-Posts.tsx
```

It's also common to use ignored directories to house related files that do not contain any route files:

```
__root.tsx
posts.tsx
posts
  index.tsx
  $postId.tsx
  $postId
    edit.tsx
    -components
      PostEditor.tsx
  -components
    Post.tsx
-components
  Posts.tsx
-utils
  Posts.tsx
```
