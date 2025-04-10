---
title: File-Based Routing API Reference
---

TanStack Router's file-based routing is quite flexible and can be configured to suit your project's needs.

## Configuration options

The following options are available for configuring the file-based routing:

- [`routesDirectory` (required)](#routesdirectory-required)
- [`generatedRouteTree` (required)](#generatedroutetree-required)
- [`virtualRouteConfig`](#virtualrouteconfig)
- [`routeFilePrefix`](#routefileprefix)
- [`routeFileIgnorePrefix`](#routefileignoreprefix)
- [`indexToken`](#indextoken)
- [`routeToken`](#routetoken)
- [`quoteStyle`](#quotestyle)
- [`semicolons`](#semicolons)
- [`apiBase`](#apibase)
- [`autoCodeSplitting`](#autocodesplitting)
- [`disableTypes`](#disabletypes)
- [`addExtensions`](#addextensions)
- [`disableLogging`](#disablelogging)
- [`routeTreeFileHeader`](#routetreefileheader)
- [`routeTreeFileFooter`](#routetreefilefooter)
- [`disableManifestGeneration`](#disablemanifestgeneration)
- [`enableRouteTreeFormatting`](#enableroutetreeformatting)

> [!WARNING]
> Do not set the `routeFilePrefix`, `routeFileIgnorePrefix`, or `routeFileIgnorePattern` options, to match any of the tokens used in the **File Naming Conventions** guide, or you may run into unexpected behavior.

### `routesDirectory` (required)

This is the path to the directory where the route files are located, relative to the cwd (current working directory).

By default, the value is set to the following and cannot be set to an empty `string` or `undefined`.

```txt
./src/routes
```

### `generatedRouteTree` (required)

This is the path to the file where the generated route tree will be saved, relative to the cwd (current working directory).

By default, the value is set to the following and cannot be set to an empty `string` or `undefined`.

```txt
./src/routeTree.gen.ts
```

If the [`disableTypes`](#disabletypes) is set to `true`, the generated route tree will be saved with the `.js` extension instead of `.ts`.

### `virtualRouteConfig`

This option is used to configure the Virtual File Routes feature. See the "Virtual File Routes" guide for more information.

By default, this value is set to `undefined`.

### `routeFileIgnorePrefix`

This option is used to ignore specific files and directories in the route directory. This can be useful if you want to "opt-in" certain files or directories that you do not want to be considered for routing.

By default, this value is set to `-`.

When using this option, it allows you have structures like this where it let's you co-located related files that are not route files:

```txt
src/routes
├── posts
│   ├── -components  // Ignored
│   │   ├── Post.tsx
│   ├── index.tsx
│   ├── route.tsx
```

### `routeFileIgnorePattern`

This option is used to ignore specific files and directories in the route directory. It can be used in regular expression format. For example, `.((css|const).ts)|test-page` will ignore files / directories with names containing `.css.ts`, `.const.ts` or `test-page`.

By default, this value is set to `undefined`.

### `routeFilePrefix`

This option is used to identify route files in the route directory. This means that only files that start with this prefix will be considered for routing.

By default, this value is set to `` and as such all files in the route directory will be considered for routing.

### `routeToken`

As mentioned in the Routing Concepts guide, a layout route is rendered at the specified path, and the child routes are rendered within the layout route. The `routeToken` is used to identify the layout route file in the route directory.

By default, this value is set to `route`.

> 🧠 the following filenames would equal the same runtime URL:

```txt
src/routes/posts.tsx -> /posts
src/routes/posts.route.tsx -> /posts
src/routes/posts/route.tsx -> /posts
```

### `indexToken`

As mentioned in the Routing Concepts guide, an index route is a route that is matched when the URL path is exactly the same as the parent route. The `indexToken` is used to identify the index route file in the route directory.

By default, this value is set to `index`.

> 🧠 the following filenames would equal the same runtime URL:

```txt
src/routes/posts.index.tsx -> /posts/
src/routes/posts/index.tsx -> /posts/
```

### `quoteStyle`

When your generated route tree is generated and when you first create a new route, those files will be formatted with the quote style you specify here.

By default, this value is set to `single`.

> [!TIP]
> You should ignore the path of your generated route tree file from your linter and formatter to avoid conflicts.

### `semicolons`

When your generated route tree is generated and when you first create a new route, those files will be formatted with semicolons if this option is set to `true`.

By default, this value is set to `false`.

> [!TIP]
> You should ignore the path of your generated route tree file from your linter and formatter to avoid conflicts.

### `autoCodeSplitting`

This feature is only available is you are using the TanStack Router Bundler Plugin.

This option is used to enable automatic code-splitting for non-critical route configuration items. See the "Automatic Code-Splitting" guide for more information.

By default, this value is set to `false`.

> [!IMPORTANT]
> The next major release of TanStack Router (i.e. v2), will have this value defaulted to `true`.

### `disableTypes`

This option is used to disable generating types for the route tree.

If set to `true`, the generated route tree will not include any types and will be written as a `.js` file instead of a `.ts` file.

By default, this value is set to `false`.

### `addExtensions`

This option adds file extensions to the route names in the generated route tree.

By default, this value is set to `false`.

### `disableLogging`

This option turns off the console logging for the route generation process.

By default, this value is set to `false`.

### `routeTreeFileHeader`

This option let's you prepend content to the start of the generated route tree file.

By default, this value is set to:

```json
[
  "/* eslint-disable */",
  "// @ts-nocheck",
  "// noinspection JSUnusedGlobalSymbols"
]
```

### `routeTreeFileFooter`

This option let's you append content to the end of the generated route tree file.

By default, this value is set to:

```json
[]
```

### `disableManifestGeneration`

[TanStack Start](/start) leverages the `generatedRouteTree` file to also store a JSON tree which allows Start to easily traverse the available route tree to understand the routing structure of the application. This JSON tree is saved at the end of the generated route tree file.

This option allows you to disable the generation of the manifest.

By default, this value is set to `false`.

### `enableRouteTreeFormatting`

This option turns on the formatting function on the generated route tree file, which can be time-consuming for large projects.

By default, this value is set to `true`.
