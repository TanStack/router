---
title: File-Based Routing
---

Most of the TanStack Router documentation is written for file-based routing and is intended to help you understand in more detail how to configure file-based routing and the technical details behind how it works. While file-based routing is the preferred and recommended way to configure TanStack Router, you can also use [code-based routing](./code-based-routing.md) if you prefer.

> [!NOTE]
> 🧠 If you are already familiar with how file-based routing works and are looking for setup instructions, you can skip ahead to the [Installation](#installation) section. Or if you looking for the configuration options, skip ahead to the [Options](#options) section.

## What is File-Based Routing?

File-based routing is a way to configure your routes using the filesystem. Instead of defining your route structure via code, you can define your routes using a series of files and directories that represent the route hierarchy of your application. This brings a number of benefits:

- **Simplicity**: File-based routing is visually intuitive and easy to understand for both new and experienced developers.
- **Organization**: Routes are organized in a way that mirrors the URL structure of your application.
- **Scalability**: As your application grows, file-based routing makes it easy to add new routes and maintain existing ones.
- **Code-Splitting**: File-based routing allows TanStack Router to automatically code-split your routes for better performance.
- **Type-Safety**: File-based routing raises the ceiling on type-safety by generating managing type linkages for your routes, which can otherwise be a tedious process via code-based routing.
- **Consistency**: File-based routing enforces a consistent structure for your routes, making it easier to maintain and update your application and move from one project to another.

## `/`s or `.`s?

While directories have long been used to represent route hierarchy, file-based routing introduces an additional concept of using the `.` character in the file-name to denote a route nesting. This allows you to avoid creating directories for few deeply nested routes and continue to use directories for wider route hierarchies. Let's take a look at some examples!

## Directory Routes

Directories can be used to denote route hierarchy, which can be useful for organizing multiple routes into logical groups and also cutting down on the filename length for large groups of deeply nested routes:

| Filename                | Route Path                | Component Output                  |
| ----------------------- | ------------------------- | --------------------------------- |
| ʦ `__root.tsx`          |                           | `<Root>`                          |
| ʦ `index.tsx`           | `/` (exact)               | `<Root><RootIndex>`               |
| ʦ `about.tsx`           | `/about`                  | `<Root><About>`                   |
| ʦ `posts.tsx`           | `/posts`                  | `<Root><Posts>`                   |
| 📂 `posts`              |                           |                                   |
| ┄ ʦ `index.tsx`         | `/posts` (exact)          | `<Root><Posts><PostsIndex>`       |
| ┄ ʦ `$postId.tsx`       | `/posts/$postId`          | `<Root><Posts><Post>`             |
| 📂 `posts_`             |                           |                                   |
| ┄ 📂 `$postId`          |                           |                                   |
| ┄ ┄ ʦ `edit.tsx`        | `/posts/$postId/edit`     | `<Root><EditPost>`                |
| ʦ `settings.tsx`        | `/settings`               | `<Root><Settings>`                |
| 📂 `settings`           |                           | `<Root><Settings>`                |
| ┄ ʦ `profile.tsx`       | `/settings/profile`       | `<Root><Settings><Profile>`       |
| ┄ ʦ `notifications.tsx` | `/settings/notifications` | `<Root><Settings><Notifications>` |
| ʦ `_layout.tsx`         |                           | `<Root><Layout>`                  |
| 📂 `_layout`            |                           |                                   |
| ┄ ʦ `layout-a.tsx`      | `/layout-a`               | `<Root><Layout><LayoutA>`         |
| ┄ ʦ `layout-b.tsx`      | `/layout-b`               | `<Root><Layout><LayoutB>`         |
| 📂 `files`              |                           |                                   |
| ┄ ʦ `$.tsx`             | `/files/$`                | `<Root><Files>`                   |

## Flat Routes

Flat routing gives you the ability to use `.`s to denote route nesting levels. This can be useful when you have a large number of uniquely deeply nested routes and want to avoid creating directories for each one:

| Filename                       | Route Path                | Component Output                  |
| ------------------------------ | ------------------------- | --------------------------------- |
| ʦ `__root.tsx`                 |                           | `<Root>`                          |
| ʦ `index.tsx`                  | `/` (exact)               | `<Root><RootIndex>`               |
| ʦ `about.tsx`                  | `/about`                  | `<Root><About>`                   |
| ʦ `posts.tsx`                  | `/posts`                  | `<Root><Posts>`                   |
| ʦ `posts.index.tsx`            | `/posts` (exact)          | `<Root><Posts><PostsIndex>`       |
| ʦ `posts.$postId.tsx`          | `/posts/$postId`          | `<Root><Posts><Post>`             |
| ʦ `posts_.$postId.edit.tsx`    | `/posts/$postId/edit`     | `<Root><EditPost>`                |
| ʦ `settings.tsx`               | `/settings`               | `<Root><Settings>`                |
| ʦ `settings.profile.tsx`       | `/settings/profile`       | `<Root><Settings><Profile>`       |
| ʦ `settings.notifications.tsx` | `/settings/notifications` | `<Root><Settings><Notifications>` |
| ʦ `_layout.tsx`                |                           | `<Root><Layout>`                  |
| ʦ `_layout.layout-a.tsx`       | `/layout-a`               | `<Root><Layout><LayoutA>`         |
| ʦ `_layout.layout-b.tsx`       | `/layout-b`               | `<Root><Layout><LayoutB>`         |
| ʦ `files.$.tsx`                | `/files/$`                | `<Root><Files>`                   |

## Mixed Flat and Directory Routes

It's extremely likely that a 100% directory or flat route structure won't be the best fit for your project, which is why TanStack Router allows you to mix both flat and directory routes together to create a route tree that uses the best of both worlds where it makes sense:

| Filename                       | Route Path                | Component Output                  |
| ------------------------------ | ------------------------- | --------------------------------- |
| ʦ `__root.tsx`                 |                           | `<Root>`                          |
| ʦ `index.tsx`                  | `/` (exact)               | `<Root><RootIndex>`               |
| ʦ `about.tsx`                  | `/about`                  | `<Root><About>`                   |
| ʦ `posts.tsx`                  | `/posts`                  | `<Root><Posts>`                   |
| 📂 `posts`                     |                           |                                   |
| ┄ ʦ `index.tsx`                | `/posts` (exact)          | `<Root><Posts><PostsIndex>`       |
| ┄ ʦ `$postId.tsx`              | `/posts/$postId`          | `<Root><Posts><Post>`             |
| ┄ ʦ `$postId.edit.tsx`         | `/posts/$postId/edit`     | `<Root><Posts><Post><EditPost>`   |
| ʦ `settings.tsx`               | `/settings`               | `<Root><Settings>`                |
| ʦ `settings.profile.tsx`       | `/settings/profile`       | `<Root><Settings><Profile>`       |
| ʦ `settings.notifications.tsx` | `/settings/notifications` | `<Root><Settings><Notifications>` |

Both flat and directory routes can be mixed together to create a route tree that uses the best of both worlds where it makes sense.

> [!TIP]
> If you find the need to customize the location of your route files or completely override the discovery of routes, you can use [Virtual File Routes](./virtual-file-routes.md) to programmatically build your route tree while still getting the awesome benefits of file-based routing.

## Dynamic Path Params

Dynamic path params can be used in both flat and directory routes to create routes that can match a dynamic segment of the URL path. Dynamic path params are denoted by the `$` character in the filename:

| Filename              | Route Path       | Component Output            |
| --------------------- | ---------------- | --------------------------- |
| ...                   | ...              | ...                         |
| ʦ `posts.$postId.tsx` | `/posts/$postId` | `<Root><Posts><Post><Post>` |

We'll learn more about dynamic path params in the [Path Params](./path-params.md) guide.

## Pathless Routes

Pathless routes wrap child routes with either logic or a component without requiring a URL path. Non-path routes are denoted by the `_` character in the filename:

| Filename       | Route Path | Component Output |
| -------------- | ---------- | ---------------- |
| ʦ `_app.tsx`   |            |                  |
| ʦ `_app.a.tsx` | /a         | `<Root><App><A>` |
| ʦ `_app.b.tsx` | /b         | `<Root><App><B>` |

To learn more about pathless routes, see the [Routing Concepts - Pathless Routes](./routing-concepts.md#pathless-routes) guide.

## File Naming Conventions

File-based routing requires that you follow a few simple file naming conventions to ensure that your routes are generated correctly. The concepts these conventions enable are covered in detail in the [Route Trees & Nesting](./route-trees.md) guide.

> [!IMPORTANT]
> Routes starting with `/api` are reserved and cannot not be used for file-based routing. These routes are reserved for future use by the TanStack Start for API routes. If you need to use routes starting with `/api` when using TanStack Router with file-based routing, then you'll need to configure the `apiBase` option to a different value.

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
    This can be configured via the `indexToken` configuration option, see [options](#options).
- **`.route.tsx` File Type**
  - When using directories to organize your routes, the `route` suffix can be used to create a route file at the directory's path. For example, `blog.post.route.tsx` or `blog/post/route.tsx` can be used at the route file for the `/blog/post` route.
    This can be configured via the `routeToken` configuration option, see [options](#options).
- **`.lazy.tsx` File Type**
  - The `lazy` suffix can be used to code-split components for a route. For example, `blog.post.lazy.tsx` will be used as the component for the `blog.post` route.

## Installation

To get started with file-based routing, you'll need to configure your project's bundler to use the TanStack Router Plugin or the TanStack Router CLI.

To enable file-based routing, you'll need to be using React with a supported bundler. TanStack Router currently has support for the following bundlers:

- [Vite](#configuration-with-vite)
- [Rspack/Rsbuild](#configuration-with-rspackrsbuild)
- [Webpack](#configuration-with-webpack)
- [Esbuild](#configuration-with-esbuild)
- Others??? (let us know if you'd like to see support for a specific bundler)

When using using TanStack Router's file-based routing through one of the supported bundlers, our plugin will **automatically generate your route configuration through your bundler's dev and build processes**. It is the easiest way to use TanStack Router's route generation features.

If your bundler is not yet supported, you can reach out to us on Discord or GitHub to let us know. Till then, fear not! You can still use the [`@tanstack/router-cli`](#configuration-with-the-tanstack-router-cli) package to generate your route tree file.

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

Now that you've added the plugin to your Vite configuration, you're all set to start using file-based routing with TanStack Router.

You shouldn't forget to _ignore_ the generated route tree file. Head over to the [Ignoring the generated route tree file](#ignoring-the-generated-route-tree-file) section to learn more.

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

Now that you've added the plugin to your Rspack/Rsbuild configuration, you're all set to start using file-based routing with TanStack Router.

You shouldn't forget to _ignore_ the generated route tree file. Head over to the [Ignoring the generated route tree file](#ignoring-the-generated-route-tree-file) section to learn more.

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

Now that you've added the plugin to your Webpack configuration, you're all set to start using file-based routing with TanStack Router.

You shouldn't forget to _ignore_ the generated route tree file. Head over to the [Ignoring the generated route tree file](#ignoring-the-generated-route-tree-file) section to learn more.

### Configuration with Esbuild

To use file-based routing with **Esbuild**, you'll need to install the `@tanstack/router-plugin` package.

```sh
npm install -D @tanstack/router-plugin
```

Once installed, you'll need to add the plugin to your configuration.

```tsx
// esbuild.config.js
import { TanStackRouterEsbuild } from '@tanstack/router-plugin/esbuild'

export default {
  // ...
  plugins: [TanStackRouterEsbuild()],
}
```

Or, you can clone our [Quickstart Esbuild example](https://github.com/TanStack/router/tree/main/examples/react/quickstart-esbuild-file-based) and get started.

Now that you've added the plugin to your Esbuild configuration, you're all set to start using file-based routing with TanStack Router.

You shouldn't forget to _ignore_ the generated route tree file. Head over to the [Ignoring the generated route tree file](#ignoring-the-generated-route-tree-file) section to learn more.

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

You shouldn't forget to _ignore_ the generated route tree file. Head over to the [Ignoring the generated route tree file](#ignoring-the-generated-route-tree-file) section to learn more.

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

### Ignoring the generated route tree file

If your project is configured to use a linter and/or formatter, you may want to ignore the generated route tree file. This is this file is managed by TanStack Router and shouldn't and therefore shouldn't be changed by your linter or formatter.

Here are some resources to help you ignore the generated route tree file:

- Prettier - [https://prettier.io/docs/en/ignore.html#ignoring-files-prettierignore](https://prettier.io/docs/en/ignore.html#ignoring-files-prettierignore)
- ESLint - [https://eslint.org/docs/latest/use/configure/ignore#ignoring-files](https://eslint.org/docs/latest/use/configure/ignore#ignoring-files)
- Biome - [https://biomejs.dev/reference/configuration/#filesignore](https://biomejs.dev/reference/configuration/#filesignore)

If you are using VSCode, you can also add the following to your `.vscode/settings.json` file to exclude the generated route tree file from the editor's file watcher:

```json
{
  "files.watcherExclude": {
    "**/routeTree.gen.ts": true
  }
}
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
- **`indexToken`**
  - (Optional, **Defaults to `'index'`**) allows to customize the `index` Token [file naming convention](#file-naming-conventions).
- **`routeToken`**
  - (Optional, **Defaults to `'route'`**) allows to customize the `route` Token [file naming convention](#file-naming-conventions).
- **`routesDirectory`**
  - (Required) The directory containing the routes relative to the cwd.
- **`generatedRouteTree`**
  - (Required) The path to the file where the generated route tree will be saved, relative to the cwd.
- **`autoCodeSplitting`**

  - (Optional, **Defaults to `false`**)
  - If set to `true`, all non-critical route configuration items will be automatically code-split.
  - See the [using automatic code-splitting](./code-splitting.md#using-automatic-code-splitting) guide.

- **`quoteStyle`**
  - (Optional, **Defaults to `single`**) whether to use `single` or `double` quotes when formatting the generated route tree file.`
- **`semicolons`**
  - (Optional, **Defaults to `false`**) whether to use semicolons in the generated route tree file.
- **`apiBase`**
  - (Optional) The base path for API routes. Defaults to `/api`.
  - This option is reserved for future use by the TanStack Start for API routes.
- **`disableTypes`**
  - (Optional, **Defaults to `false`**) whether to disable generating types for the route tree
  - If set to `true`, the generated route tree will not include any types.
  - If set to `true` and the `generatedRouteTree` file ends with `.ts` or `.tsx`, the generated route tree will be written as a `.js` file instead.
- **`addExtensions`**
  - (Optional, **Defaults to `false`**) add file extensions to the route names in the generated route tree
- **`disableLogging`**
  - (Optional, **Defaults to `false`**) disables logging for the route generation process
- **`routeTreeFileHeader`**

  - (Optional) An array of strings to prepend to the generated route tree file content.
  - Default:
  - ```
    [
      '/* eslint-disable */',
      '// @ts-nocheck',
      '// noinspection JSUnusedGlobalSymbols'
    ]
    ```

- **`routeTreeFileFooter`**
  - (Optional) An array of strings to append to the generated route tree file content.
  - Default: `[]`
- **`disableManifestGeneration`**
  - (Optional, **Defaults to `false`**) disables generating the route tree manifest

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
