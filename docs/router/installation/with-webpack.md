---
title: Installation with Webpack
---

To use file-based routing with **Webpack**, you'll need to install the `@tanstack/router-plugin` package.

<!-- ::start:tabs variant="package-manager" mode="dev-install" -->

react: @tanstack/router-plugin
solid: @tanstack/router-plugin

<!-- ::end:tabs -->

Once installed, you'll need to add the plugin to your configuration.

<!-- ::start:framework -->

# React

```ts title="webpack.config.ts"
import { tanstackRouter } from '@tanstack/router-plugin/webpack'

export default {
  output: {
    publicPath: '/',
  },
  devServer: {
    historyApiFallback: {
      rewrites: [{ from: /./, to: '/index.html' }],
    },
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
  ],
}
```

Or, you can clone our [Quickstart Webpack example](https://github.com/TanStack/router/tree/main/examples/react/quickstart-webpack-file-based) and get started.

# Solid

```ts title="webpack.config.ts"
import { tanstackRouter } from '@tanstack/router-plugin/webpack'

export default {
  output: {
    publicPath: '/',
  },
  devServer: {
    historyApiFallback: {
      rewrites: [{ from: /./, to: '/index.html' }],
    },
  },
  plugins: [
    tanstackRouter({
      target: 'solid',
      autoCodeSplitting: true,
    }),
  ],
}
```

And in the .babelrc (SWC doesn't support solid-js, see [here](https://www.answeroverflow.com/m/1135200483116593182)), add these presets:

```tsx
// .babelrc

{
  "presets": ["babel-preset-solid", "@babel/preset-typescript"]
}

```

Or, for a full webpack.config.js, you can clone our [Quickstart Webpack example](https://github.com/TanStack/router/tree/main/examples/solid/quickstart-webpack-file-based) and get started.

<!-- ::end:framework -->

Now that you've added the plugin to your Webpack configuration, you're all set to start using file-based routing with TanStack Router.

## Serving direct route loads

TanStack Router uses the browser history API for client-side navigation. Webpack
needs to serve your application shell for direct loads and refreshes of nested
routes like `/posts/1`, otherwise the dev server may try to find a real file at
that path and return a 404 before the router can render.

Configure `devServer.historyApiFallback` to rewrite unmatched requests to your
HTML entry point:

```ts title="webpack.config.ts"
export default {
  devServer: {
    historyApiFallback: {
      rewrites: [{ from: /./, to: '/index.html' }],
    },
  },
}
```

Also set `output.publicPath` to the public base URL where Webpack assets are
served from. For root deployments, use `/`:

```ts title="webpack.config.ts"
export default {
  output: {
    publicPath: '/',
  },
}
```

If your app is deployed under a subpath, set `publicPath` to that actual base
instead, including the leading and trailing slash:

```ts title="webpack.config.ts"
export default {
  output: {
    publicPath: '/my-app/',
  },
}
```

Keep the fallback target aligned with where your HTML shell is served. The
maintained React and Solid Webpack quickstarts use `/index.html` because the app
is served from the domain root.

## Ignoring the generated route tree file

If your project is configured to use a linter and/or formatter, you may want to ignore the generated route tree file. This file is managed by TanStack Router and therefore shouldn't be changed by your linter or formatter.

Here are some resources to help you ignore the generated route tree file:

- Prettier - [https://prettier.io/docs/en/ignore.html#ignoring-files-prettierignore](https://prettier.io/docs/en/ignore.html#ignoring-files-prettierignore)
- ESLint - [https://eslint.org/docs/latest/use/configure/ignore#ignoring-files](https://eslint.org/docs/latest/use/configure/ignore#ignoring-files)
- Biome - [https://biomejs.dev/reference/configuration/#filesignore](https://biomejs.dev/reference/configuration/#filesignore)

> [!WARNING]
> If you are using VSCode, you may experience the route tree file unexpectedly open (with errors) after renaming a route.

You can prevent that from the VSCode settings by marking the file as readonly. Our recommendation is to also exclude it from search results and file watcher with the following settings:

```json
{
  "files.readonlyInclude": {
    "**/routeTree.gen.ts": true
  },
  "files.watcherExclude": {
    "**/routeTree.gen.ts": true
  },
  "search.exclude": {
    "**/routeTree.gen.ts": true
  }
}
```

You can use those settings either at a user level or only for a single workspace by creating the file `.vscode/settings.json` at the root of your project.

## Configuration

When using the TanStack Router Plugin with Webpack for File-based routing, it comes with some sane defaults that should work for most projects:

```json
{
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts",
  "routeFileIgnorePrefix": "-",
  "quoteStyle": "single"
}
```

If these defaults work for your project, you don't need to configure anything at all! However, if you need to customize the configuration, you can do so by editing the configuration object passed into the `tanstackRouter` function.

You can find all the available configuration options in the [File-based Routing API Reference](../api/file-based-routing.md).
