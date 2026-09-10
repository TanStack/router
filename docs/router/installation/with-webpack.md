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

## SPA fallback and public path

TanStack Router is a client-side router: the browser URL changes (e.g. to `/posts/123`), but there is only one physical HTML file on the server. Two Webpack settings make sure directly loading or refreshing the page at a nested route works:

```ts title="webpack.config.ts"
export default {
  output: {
    publicPath: '/',
  },
  devServer: {
    historyApiFallback: {
      rewrites: [{ from: /./, to: '/index.html' }],
    },
  },
}
```

### `devServer.historyApiFallback`

By default, `webpack-dev-server` only knows how to serve files that physically exist, so a direct load or refresh at a route like `/posts/123` responds with a 404. Setting `historyApiFallback` tells the dev server to answer those requests with `index.html` instead, letting the router take over once the application shell has loaded. The `rewrites` option above sends every unmatched request to `/index.html`, which covers nested paths that contain dots (the default fallback skips those).

> [!NOTE]
> `historyApiFallback` only configures the development server. In production, your hosting provider or web server needs an equivalent rewrite rule that serves `index.html` for unknown paths.

### `output.publicPath`

`publicPath` controls the URL prefix used for the bundles referenced from `index.html`. If it is left relative, a page served at a nested path such as `/posts/123` will try to load its scripts from `/posts/main.bundle.js` and end up with a blank screen. Setting `publicPath: '/'` makes all asset URLs absolute so they resolve correctly from any route.

If you deploy the application under a subpath (e.g. `https://example.com/my-app/`), set `publicPath` to that actual public base (`'/my-app/'`), point the `historyApiFallback` rewrite at `'/my-app/index.html'`, and pass the same subpath as the [`basepath`](../api/router/RouterOptionsType.md#basepath-property) option to your router.

Both of the maintained Webpack quickstart examples ([React](https://github.com/TanStack/router/tree/main/examples/react/quickstart-webpack-file-based), [Solid](https://github.com/TanStack/router/tree/main/examples/solid/quickstart-webpack-file-based)) ship with this configuration.

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
