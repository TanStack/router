# Code-Based Routing

> [!TIP]
> Code-based routing is not recommended for most applications. It is recommended to use [File-Based Routing](../file-based-routing.md) instead.

## ⚠️ Before You Start

- If you're using [File-Based Routing](../file-based-routing.md), **skip this guide**.
- If you still insist on using code-based routing, you must read the [Routing Concepts](../routing-concepts.md) guide first, as it also covers core concepts of the router.

## Route Trees

Code-based routing is no different from file-based routing in that it uses the same route tree concept to organize, match and compose matching routes into a component tree. The only difference is that instead of using the filesystem to organize your routes, you use code.

Let's consider the same route tree from the [Route Trees & Nesting](../route-trees.md#route-trees) guide, and convert it to code-based routing:

Here is the file-based version:

```
routes/
├── __root.tsx
├── index.tsx
├── about.tsx
├── posts/
│   ├── index.tsx
│   ├── $postId.tsx
├── posts.$postId.edit.tsx
├── settings/
│   ├── profile.tsx
│   ├── notifications.tsx
├── _pathlessLayout.tsx
├── _pathlessLayout/
│   ├── route-a.tsx
├── ├── route-b.tsx
├── files/
│   ├── $.tsx
```

And here is a summarized code-based version:

```tsx
import { createRootRoute, createRoute } from '@tanstack/react-router'

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'about',
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
})

const postsIndexRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/',
})

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
})

const postEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts/$postId/edit',
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings',
})

const profileRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'profile',
})

const notificationsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'notifications',
})

const pathlessLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'pathlessLayout',
})

const pathlessLayoutARoute = createRoute({
  getParentRoute: () => pathlessLayoutRoute,
  path: 'route-a',
})

const pathlessLayoutBRoute = createRoute({
  getParentRoute: () => pathlessLayoutRoute,
  path: 'route-b',
})

const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'files/$',
})
```

## Anatomy of a Route

All other routes other than the root route are configured using the `createRoute` function:

```tsx
const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts',
  component: PostsComponent,
})
```

The `getParentRoute` option is a function that returns the parent route of the route you're creating.

**❓❓❓ "Wait, you're making me pass the parent route for every route I make?"**

Absolutely! The reason for passing the parent route has **everything to do with the magical type safety** of TanStack Router. Without the parent route, TypeScript would have no idea what types to supply your route with!

> [!IMPORTANT]
> For every route that **NOT** the **Root Route** or a **Pathless Layout Route**, a `path` option is required. This is the path that will be matched against the URL pathname to determine if the route is a match.

When configuring route `path` option on a route, it ignores leading and trailing slashes (this does not include "index" route paths `/`). You can include them if you want, but they will be normalized internally by TanStack Router. Here is a table of valid paths and what they will be normalized to:

| Path     | Normalized Path |
| -------- | --------------- |
| `/`      | `/`             |
| `/about` | `about`         |
| `about/` | `about`         |
| `about`  | `about`         |
| `$`      | `$`             |
| `/$`     | `$`             |
| `/$/`    | `$`             |

## Manually building the route tree

When building a route tree in code, it's not enough to define the parent route of each route. You must also construct the final route tree by adding each route to its parent route's `children` array. This is because the route tree is not built automatically for you like it is in file-based routing.

```tsx
/* prettier-ignore */
const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
  postsRoute.addChildren([
    postsIndexRoute,
    postRoute,
  ]),
  postEditorRoute,
  settingsRoute.addChildren([
    profileRoute,
    notificationsRoute,
  ]),
  pathlessLayoutRoute.addChildren([
    pathlessLayoutARoute,
    pathlessLayoutBRoute,
  ]),
  filesRoute.addChildren([
    fileRoute,
  ]),
])
/* prettier-ignore-end */
```

But before you can go ahead and build the route tree, you need to understand how the Routing Concepts for Code-Based Routing work.

## Routing Concepts for Code-Based Routing

Believe it or not, file-based routing is really a superset of code-based routing and uses the filesystem and a bit of code-generation abstraction on top of it to generate this structure you see above automatically.

We're going to assume you've read the [Routing Concepts](../routing-concepts.md) guide and are familiar with each of these main concepts:

- The Root Route
- Basic Routes
- Index Routes
- Dynamic Route Segments
- Splat / Catch-All Routes
- Layout Routes
- Pathless Routes
- Non-Nested Routes

Now, let's take a look at how to create each of these route types in code.

## The Root Route

Creating a root route in code-based routing is thankfully the same as doing so in file-based routing. Call the `createRootRoute()` function.

Unlike file-based routing however, you do not need to export the root route if you don't want to. It's certainly not recommended to build an entire route tree and application in a single file (although you can and we do this in the examples to demonstrate routing concepts in brevity).

```tsx
// Standard root route
import { createRootRoute } from '@tanstack/react-router'

const rootRoute = createRootRoute()

// Root route with Context
import { createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

export interface MyRouterContext {
  queryClient: QueryClient
}
const rootRoute = createRootRouteWithContext<MyRouterContext>()
```

To learn more about Context in TanStack Router, see the [Router Context](../../guide/router-context.md) guide.

## Basic Routes

To create a basic route, simply provide a normal `path` string to the `createRoute` function:

```tsx
const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'about',
})
```

See, it's that simple! The `aboutRoute` will match the URL `/about`.

## Index Routes

Unlike file-based routing, which uses the `index` filename to denote an index route, code-based routing uses a single slash `/` to denote an index route. For example, the `posts.index.tsx` file from our example route tree above would be represented in code-based routing like this:

```tsx
const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
})

const postsIndexRoute = createRoute({
  getParentRoute: () => postsRoute,
  // Notice the single slash `/` here
  path: '/',
})
```

So, the `postsIndexRoute` will match the URL `/posts/` (or `/posts`).

## Dynamic Route Segments

Dynamic route segments work exactly the same in code-based routing as they do in file-based routing. Simply prefix a segment of the path with a `$` and it will be captured into the `params` object of the route's `loader` or `component`:

```tsx
const postIdRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
  // In a loader
  loader: ({ params }) => fetchPost(params.postId),
  // Or in a component
  component: PostComponent,
})

function PostComponent() {
  const { postId } = postIdRoute.useParams()
  return <div>Post ID: {postId}</div>
}
```

> [!TIP]
> If your component is code-split, you can use the [getRouteApi function](../../guide/code-splitting.md#manually-accessing-route-apis-in-other-files-with-the-getrouteapi-helper) to avoid having to import the `postIdRoute` configuration to get access to the typed `useParams()` hook.

## Splat / Catch-All Routes

As expected, splat/catch-all routes also work the same in code-based routing as they do in file-based routing. Simply prefix a segment of the path with a `$` and it will be captured into the `params` object under the `_splat` key:

```tsx
const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'files',
})

const fileRoute = createRoute({
  getParentRoute: () => filesRoute,
  path: '$',
})
```

For the URL `/documents/hello-world`, the `params` object will look like this:

```js
{
  '_splat': 'documents/hello-world'
}
```

## Layout Routes

Layout routes are routes that wrap their children in a layout component. In code-based routing, you can create a layout route by simply nesting a route under another route:

```tsx
const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
  component: PostsLayoutComponent, // The layout component
})

function PostsLayoutComponent() {
  return (
    <div>
      <h1>Posts</h1>
      <Outlet />
    </div>
  )
}

const postsIndexRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/',
})

const postsCreateRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: 'create',
})

const routeTree = rootRoute.addChildren([
  // The postsRoute is the layout route
  // Its children will be nested under the PostsLayoutComponent
  postsRoute.addChildren([postsIndexRoute, postsCreateRoute]),
])
```

Now, both the `postsIndexRoute` and `postsCreateRoute` will render their contents inside of the `PostsLayoutComponent`:

```tsx
// URL: /posts
<PostsLayoutComponent>
  <PostsIndexComponent />
</PostsLayoutComponent>

// URL: /posts/create
<PostsLayoutComponent>
  <PostsCreateComponent />
</PostsLayoutComponent>
```

## Pathless Layout Routes

In file-based routing a pathless layout route is prefixed with a `_`, but in code-based routing, this is simply a route with an `id` instead of a `path` option. This is because code-based routing does not use the filesystem to organize routes, so there is no need to prefix a route with a `_` to denote that it has no path.

```tsx
const pathlessLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'pathlessLayout',
  component: PathlessLayoutComponent,
})

function PathlessLayoutComponent() {
  return (
    <div>
      <h1>Pathless Layout</h1>
      <Outlet />
    </div>
  )
}

const pathlessLayoutARoute = createRoute({
  getParentRoute: () => pathlessLayoutRoute,
  path: 'route-a',
})

const pathlessLayoutBRoute = createRoute({
  getParentRoute: () => pathlessLayoutRoute,
  path: 'route-b',
})

const routeTree = rootRoute.addChildren([
  // The pathless layout route has no path, only an id
  // So its children will be nested under the pathless layout route
  pathlessLayoutRoute.addChildren([pathlessLayoutARoute, pathlessLayoutBRoute]),
])
```

Now both `/route-a` and `/route-b` will render their contents inside of the `PathlessLayoutComponent`:

```tsx
// URL: /route-a
<PathlessLayoutComponent>
  <RouteAComponent />
</PathlessLayoutComponent>

// URL: /route-b
<PathlessLayoutComponent>
  <RouteBComponent />
</PathlessLayoutComponent>
```

## Non-Nested Routes

Building non-nested routes in code-based routing does not require using a trailing `_` in the path, but does require you to build your route and route tree with the right paths and nesting. Let's consider the route tree where we want the post editor to **not** be nested under the posts route:

- `/posts_/$postId/edit`
- `/posts`
  - `$postId`

To do this we need to build a separate route for the post editor and include the entire path in the `path` option from the root of where we want the route to be nested (in this case, the root):

```tsx
// The posts editor route is nested under the root route
const postEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  // The path includes the entire path we need to match
  path: 'posts/$postId/edit',
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
})

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
})

const routeTree = rootRoute.addChildren([
  // The post editor route is nested under the root route
  postEditorRoute,
  postsRoute.addChildren([postRoute]),
])
```

# File-Based Routing

Most of the TanStack Router documentation is written for file-based routing and is intended to help you understand in more detail how to configure file-based routing and the technical details behind how it works. While file-based routing is the preferred and recommended way to configure TanStack Router, you can also use [code-based routing](../code-based-routing.md) if you prefer.

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

Directories can be used to denote route hierarchy, which can be useful for organizing multiple routes into logical groups and also cutting down on the filename length for large groups of deeply nested routes.

See the example below:

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
| ʦ `_pathlessLayout.tsx` |                           | `<Root><PathlessLayout>`          |
| 📂 `_pathlessLayout`    |                           |                                   |
| ┄ ʦ `route-a.tsx`       | `/route-a`                | `<Root><PathlessLayout><RouteA>`  |
| ┄ ʦ `route-b.tsx`       | `/route-b`                | `<Root><PathlessLayout><RouteB>`  |
| 📂 `files`              |                           |                                   |
| ┄ ʦ `$.tsx`             | `/files/$`                | `<Root><Files>`                   |
| 📂 `account`            |                           |                                   |
| ┄ ʦ `route.tsx`         | `/account`                | `<Root><Account>`                 |
| ┄ ʦ `overview.tsx`      | `/account/overview`       | `<Root><Account><Overview>`       |

## Flat Routes

Flat routing gives you the ability to use `.`s to denote route nesting levels.

This can be useful when you have a large number of uniquely deeply nested routes and want to avoid creating directories for each one:

See the example below:

| Filename                        | Route Path                | Component Output                  |
| ------------------------------- | ------------------------- | --------------------------------- |
| ʦ `__root.tsx`                  |                           | `<Root>`                          |
| ʦ `index.tsx`                   | `/` (exact)               | `<Root><RootIndex>`               |
| ʦ `about.tsx`                   | `/about`                  | `<Root><About>`                   |
| ʦ `posts.tsx`                   | `/posts`                  | `<Root><Posts>`                   |
| ʦ `posts.index.tsx`             | `/posts` (exact)          | `<Root><Posts><PostsIndex>`       |
| ʦ `posts.$postId.tsx`           | `/posts/$postId`          | `<Root><Posts><Post>`             |
| ʦ `posts_.$postId.edit.tsx`     | `/posts/$postId/edit`     | `<Root><EditPost>`                |
| ʦ `settings.tsx`                | `/settings`               | `<Root><Settings>`                |
| ʦ `settings.profile.tsx`        | `/settings/profile`       | `<Root><Settings><Profile>`       |
| ʦ `settings.notifications.tsx`  | `/settings/notifications` | `<Root><Settings><Notifications>` |
| ʦ `_pathlessLayout.tsx`         |                           | `<Root><PathlessLayout>`          |
| ʦ `_pathlessLayout.route-a.tsx` | `/route-a`                | `<Root><PathlessLayout><RouteA>`  |
| ʦ `_pathlessLayout.route-b.tsx` | `/route-b`                | `<Root><PathlessLayout><RouteB>`  |
| ʦ `files.$.tsx`                 | `/files/$`                | `<Root><Files>`                   |
| ʦ `account.tsx`                 | `/account`                | `<Root><Account>`                 |
| ʦ `account.overview.tsx`        | `/account/overview`       | `<Root><Account><Overview>`       |

## Mixed Flat and Directory Routes

It's extremely likely that a 100% directory or flat route structure won't be the best fit for your project, which is why TanStack Router allows you to mix both flat and directory routes together to create a route tree that uses the best of both worlds where it makes sense:

See the example below:

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
| ʦ `account.tsx`                | `/account`                | `<Root><Account>`                 |
| ʦ `account.overview.tsx`       | `/account/overview`       | `<Root><Account><Overview>`       |

Both flat and directory routes can be mixed together to create a route tree that uses the best of both worlds where it makes sense.

> [!TIP]
> If you find that the default file-based routing structure doesn't fit your needs, you can always use [Virtual File Routes](../virtual-file-routes.md) to control the source of your routes whilst still getting the awesome performance benefits of file-based routing.

## Getting started with File-Based Routing

To get started with file-based routing, you'll need to configure your project's bundler to use the TanStack Router Plugin or the TanStack Router CLI.

To enable file-based routing, you'll need to be using React with a supported bundler. See if your bundler is listed in the configuration guides below.

[//]: # 'SupportedBundlersList'

- [Installation with Vite](../installation-with-vite.md)
- [Installation with Rspack/Rsbuild](../installation-with-rspack.md)
- [Installation with Webpack](../installation-with-webpack.md)
- [Installation with Esbuild](../installation-with-esbuild.md)

[//]: # 'SupportedBundlersList'

When using TanStack Router's file-based routing through one of the supported bundlers, our plugin will **automatically generate your route configuration through your bundler's dev and build processes**. It is the easiest way to use TanStack Router's route generation features.

If your bundler is not yet supported, you can reach out to us on Discord or GitHub to let us know. Till then, fear not! You can still use the [`@tanstack/router-cli`](../installation-with-router-cli.md) package to generate your route tree file.

# File Naming Conventions

File-based routing requires that you follow a few simple file naming conventions to ensure that your routes are generated correctly. The concepts these conventions enable are covered in detail in the [Route Trees & Nesting](../route-trees.md) guide.

| Feature                            | Description                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`__root.tsx`**                   | The root route file must be named `__root.tsx` and must be placed in the root of the configured `routesDirectory`.                                                                                                                                                                                                                                                                 |
| **`.` Separator**                  | Routes can use the `.` character to denote a nested route. For example, `blog.post` will be generated as a child of `blog`.                                                                                                                                                                                                                                                        |
| **`$` Token**                      | Route segments with the `$` token are parameterized and will extract the value from the URL pathname as a route `param`.                                                                                                                                                                                                                                                           |
| **`_` Prefix**                     | Route segments with the `_` prefix are considered to be pathless layout routes and will not be used when matching its child routes against the URL pathname.                                                                                                                                                                                                                       |
| **`_` Suffix**                     | Route segments with the `_` suffix exclude the route from being nested under any parent routes.                                                                                                                                                                                                                                                                                    |
| **`-` Prefix**                     | Files and folders with the `-` prefix are excluded from the route tree. They will not be added to the `routeTree.gen.ts` file and can be used to colocate logic in route folders.                                                                                                                                                                                                  |
| **`(folder)` folder name pattern** | A folder that matches this pattern is treated as a **route group**, preventing the folder from being included in the route's URL path.                                                                                                                                                                                                                                             |
| **`index` Token**                  | Route segments ending with the `index` token (before any file extensions) will match the parent route when the URL pathname matches the parent route exactly. This can be configured via the `indexToken` configuration option, see [options](../../../../api/file-based-routing.md#indextoken).                                                                                   |
| **`.route.tsx` File Type**         | When using directories to organise routes, the `route` suffix can be used to create a route file at the directory's path. For example, `blog.post.route.tsx` or `blog/post/route.tsx` can be used as the route file for the `/blog/post` route. This can be configured via the `routeToken` configuration option, see [options](../../../../api/file-based-routing.md#routetoken). |

> **💡 Remember:** The file-naming conventions for your project could be affected by what [options](../../../../api/file-based-routing.md) are configured.

## Dynamic Path Params

Dynamic path params can be used in both flat and directory routes to create routes that can match a dynamic segment of the URL path. Dynamic path params are denoted by the `$` character in the filename:

| Filename              | Route Path       | Component Output      |
| --------------------- | ---------------- | --------------------- |
| ...                   | ...              | ...                   |
| ʦ `posts.$postId.tsx` | `/posts/$postId` | `<Root><Posts><Post>` |

We'll learn more about dynamic path params in the [Path Params](../../guide/path-params.md) guide.

## Pathless Routes

Pathless routes wrap child routes with either logic or a component without requiring a URL path. Non-path routes are denoted by the `_` character in the filename:

| Filename       | Route Path | Component Output |
| -------------- | ---------- | ---------------- |
| ʦ `_app.tsx`   |            |                  |
| ʦ `_app.a.tsx` | /a         | `<Root><App><A>` |
| ʦ `_app.b.tsx` | /b         | `<Root><App><B>` |

To learn more about pathless routes, see the [Routing Concepts - Pathless Routes](../routing-concepts.md#pathless-layout-routes) guide.

# Installation with Vite

[//]: # 'BundlerConfiguration'

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
  plugins: [
    TanStackRouterEsbuild({ target: 'react', autoCodeSplitting: true }),
  ],
}
```

Or, you can clone our [Quickstart Esbuild example](https://github.com/TanStack/router/tree/main/examples/react/quickstart-esbuild-file-based) and get started.

Now that you've added the plugin to your Esbuild configuration, you're all set to start using file-based routing with TanStack Router.

[//]: # 'BundlerConfiguration'

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

When using the TanStack Router Plugin with Esbuild for File-based routing, it comes with some sane defaults that should work for most projects:

```json
{
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts",
  "routeFileIgnorePrefix": "-",
  "quoteStyle": "single"
}
```

If these defaults work for your project, you don't need to configure anything at all! However, if you need to customize the configuration, you can do so by editing the configuration object passed into the `TanStackRouterEsbuild` function.

You can find all the available configuration options in the [File-based Routing API Reference](../../../../api/file-based-routing.md).

# Installation with Router CLI

> [!WARNING]
> You should only use the TanStack Router CLI if you are not using a supported bundler. The CLI only supports the generation of the route tree file and does not provide any other features.

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

[//]: # 'AfterScripts'
[//]: # 'AfterScripts'

You shouldn't forget to _ignore_ the generated route tree file. Head over to the [Ignoring the generated route tree file](#ignoring-the-generated-route-tree-file) section to learn more.

With the CLI installed, the following commands are made available via the `tsr` command

## Using the `generate` command

Generates the routes for a project based on the provided configuration.

```sh
tsr generate
```

## Using the `watch` command

Continuously watches the specified directories and regenerates routes as needed.

**Usage:**

```sh
tsr watch
```

With file-based routing enabled, whenever you start your application in development mode, TanStack Router will watch your configured `routesDirectory` and generate your route tree whenever a file is added, removed, or changed.

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

When using the TanStack Router CLI for File-based routing, it comes with some sane defaults that should work for most projects:

```json
{
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts",
  "routeFileIgnorePrefix": "-",
  "quoteStyle": "single"
}
```

If these defaults work for your project, you don't need to configure anything at all! However, if you need to customize the configuration, you can do so by creating a `tsr.config.json` file in the root of your project directory.

[//]: # 'TargetConfiguration'
[//]: # 'TargetConfiguration'

You can find all the available configuration options in the [File-based Routing API Reference](../../../../api/file-based-routing.md).

# Installation with Rspack

[//]: # 'BundlerConfiguration'

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
      plugins: [
        TanStackRouterRspack({ target: 'react', autoCodeSplitting: true }),
      ],
    },
  },
})
```

Or, you can clone our [Quickstart Rspack/Rsbuild example](https://github.com/TanStack/router/tree/main/examples/react/quickstart-rspack-file-based) and get started.

Now that you've added the plugin to your Rspack/Rsbuild configuration, you're all set to start using file-based routing with TanStack Router.

[//]: # 'BundlerConfiguration'

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

When using the TanStack Router Plugin with Rspack (or Rsbuild) for File-based routing, it comes with some sane defaults that should work for most projects:

```json
{
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts",
  "routeFileIgnorePrefix": "-",
  "quoteStyle": "single"
}
```

If these defaults work for your project, you don't need to configure anything at all! However, if you need to customize the configuration, you can do so by editing the configuration object passed into the `TanStackRouterVite` function.

You can find all the available configuration options in the [File-based Routing API Reference](../../../../api/file-based-routing.md).

# Installation with Vite

[//]: # 'BundlerConfiguration'

To use file-based routing with **Vite**, you'll need to install the `@tanstack/router-plugin` package.

```sh
npm install -D @tanstack/router-plugin
```

Once installed, you'll need to add the plugin to your Vite configuration.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // Please make sure that '@tanstack/router-plugin' is passed before '@vitejs/plugin-react'
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    // ...
  ],
})
```

Or, you can clone our [Quickstart Vite example](https://github.com/TanStack/router/tree/main/examples/react/quickstart-file-based) and get started.

> [!WARNING]
> If you are using the older `@tanstack/router-vite-plugin` package, you can still continue to use it, as it will be aliased to the `@tanstack/router-plugin/vite` package. However, we would recommend using the `@tanstack/router-plugin` package directly.

Now that you've added the plugin to your Vite configuration, you're all set to start using file-based routing with TanStack Router.

[//]: # 'BundlerConfiguration'

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

When using the TanStack Router Plugin with Vite for File-based routing, it comes with some sane defaults that should work for most projects:

```json
{
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts",
  "routeFileIgnorePrefix": "-",
  "quoteStyle": "single"
}
```

If these defaults work for your project, you don't need to configure anything at all! However, if you need to customize the configuration, you can do so by editing the configuration object passed into the `TanStackRouterVite` function.

You can find all the available configuration options in the [File-based Routing API Reference](../../../../api/file-based-routing.md).

# Installation with Webpack

[//]: # 'BundlerConfiguration'

To use file-based routing with **Webpack**, you'll need to install the `@tanstack/router-plugin` package.

```sh
npm install -D @tanstack/router-plugin
```

Once installed, you'll need to add the plugin to your configuration.

```tsx
// webpack.config.ts
import { TanStackRouterWebpack } from '@tanstack/router-plugin/webpack'

export default {
  plugins: [
    TanStackRouterWebpack({ target: 'react', autoCodeSplitting: true }),
  ],
}
```

Or, you can clone our [Quickstart Webpack example](https://github.com/TanStack/router/tree/main/examples/react/quickstart-webpack-file-based) and get started.

Now that you've added the plugin to your Webpack configuration, you're all set to start using file-based routing with TanStack Router.

[//]: # 'BundlerConfiguration'

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

If these defaults work for your project, you don't need to configure anything at all! However, if you need to customize the configuration, you can do so by editing the configuration object passed into the `TanStackRouterWebpack` function.

You can find all the available configuration options in the [File-based Routing API Reference](../../../../api/file-based-routing.md).

# Route Matching

Route matching follows a consistent and predictable pattern. This guide will explain how route trees are matched.

When TanStack Router processes your route tree, all of your routes are automatically sorted to match the most specific routes first. This means that regardless of the order your route tree is defined, routes will always be sorted in this order:

- Index Route
- Static Routes (most specific to least specific)
- Dynamic Routes (longest to shortest)
- Splat/Wildcard Routes

Consider the following pseudo route tree:

```
Root
  - blog
    - $postId
    - /
    - new
  - /
  - *
  - about
  - about/us
```

After sorting, this route tree will become:

```
Root
  - /
  - about/us
  - about
  - blog
    - /
    - new
    - $postId
  - *
```

This final order represents the order in which routes will be matched based on specificity.

Using that route tree, let's follow the matching process for a few different URLs:

- `/blog`
  ```
  Root
    ❌ /
    ❌ about/us
    ❌ about
    ⏩ blog
      ✅ /
      - new
      - $postId
    - *
  ```
- `/blog/my-post`
  ```
  Root
    ❌ /
    ❌ about/us
    ❌ about
    ⏩ blog
      ❌ /
      ❌ new
      ✅ $postId
    - *
  ```
- `/`
  ```
  Root
    ✅ /
    - about/us
    - about
    - blog
      - /
      - new
      - $postId
    - *
  ```
- `/not-a-route`
  ```
  Root
    ❌ /
    ❌ about/us
    ❌ about
    ❌ blog
      - /
      - new
      - $postId
    ✅ *
  ```

# Route Trees

TanStack Router uses a nested route tree to match up the URL with the correct component tree to render.

To build a route tree, TanStack Router supports:

- [File-Based Routing](../file-based-routing.md)
- [Code-Based Routing](../code-based-routing.md)

Both methods support the exact same core features and functionality, but **file-based routing requires less code for the same or better results**. For this reason, **file-based routing is the preferred and recommended way** to configure TanStack Router. Most of the documentation is written from the perspective of file-based routing.

## Route Trees

Nested routing is a powerful concept that allows you to use a URL to render a nested component tree. For example, given the URL of `/blog/posts/123`, you could create a route hierarchy that looks like this:

```tsx
├── blog
│   ├── posts
│   │   ├── $postId
```

And render a component tree that looks like this:

```tsx
<Blog>
  <Posts>
    <Post postId="123" />
  </Posts>
</Blog>
```

Let's take that concept and expand it out to a larger site structure, but with file-names now:

```
/routes
├── __root.tsx
├── index.tsx
├── about.tsx
├── posts/
│   ├── index.tsx
│   ├── $postId.tsx
├── posts.$postId.edit.tsx
├── settings/
│   ├── profile.tsx
│   ├── notifications.tsx
├── _pathlessLayout/
│   ├── route-a.tsx
├── ├── route-b.tsx
├── files/
│   ├── $.tsx
```

The above is a valid route tree configuration that can be used with TanStack Router! There's a lot of power and convention to unpack with file-based routing, so let's break it down a bit.

## Route Tree Configuration

Route trees can be configured using a few different ways:

- [Flat Routes](../file-based-routing.md#flat-routes)
- [Directories](../file-based-routing.md#directory-routes)
- [Mixed Flat Routes and Directories](../file-based-routing.md#mixed-flat-and-directory-routes)
- [Virtual File Routes](../virtual-file-routes.md)
- [Code-Based Routes](../code-based-routing.md)

Please be sure to check out the full documentation links above for each type of route tree, or just proceed to the next section to get started with file-based routing.

# Routing Concepts

TanStack Router supports a number of powerful routing concepts that allow you to build complex and dynamic routing systems with ease.

Each of these concepts is useful and powerful, and we'll dive into each of them in the following sections.

## Anatomy of a Route

All other routes, other than the [Root Route](#the-root-route), are configured using the `createFileRoute` function, which provides type safety when using file-based routing:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  component: PostsComponent,
})
```

The `createFileRoute` function takes a single argument, the file-route's path as a string.

**❓❓❓ "Wait, you're making me pass the path of the route file to `createFileRoute`?"**

Yes! But don't worry, this path is **automatically written and managed by the router for you via the TanStack Router Bundler Plugin or Router CLI.** So, as you create new routes, move routes around or rename routes, the path will be updated for you automatically.

The reason for this pathname has everything to do with the magical type safety of TanStack Router. Without this pathname, TypeScript would have no idea what file we're in! (We wish TypeScript had a built-in for this, but they don't yet 🤷‍♂️)

## The Root Route

The root route is the top-most route in the entire tree and encapsulates all other routes as children.

- It has no path
- It is **always** matched
- Its `component` is **always** rendered

Even though it doesn't have a path, the root route has access to all of the same functionality as other routes including:

- components
- loaders
- search param validation
- etc.

To create a root route, call the `createRootRoute()` function and export it as the `Route` variable in your route file:

```tsx
// Standard root route
import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute()

// Root route with Context
import { createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

export interface MyRouterContext {
  queryClient: QueryClient
}
export const Route = createRootRouteWithContext<MyRouterContext>()
```

To learn more about Context in TanStack Router, see the [Router Context](../../guide/router-context.md) guide.

## Basic Routes

Basic routes match a specific path, for example `/about`, `/settings`, `/settings/notifications` are all basic routes, as they match the path exactly.

Let's take a look at an `/about` route:

```tsx
// about.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: AboutComponent,
})

function AboutComponent() {
  return <div>About</div>
}
```

Basic routes are simple and straightforward. They match the path exactly and render the provided component.

## Index Routes

Index routes specifically target their parent route when it is **matched exactly and no child route is matched**.

Let's take a look at an index route for a `/posts` URL:

```tsx
// posts.index.tsx
import { createFileRoute } from '@tanstack/react-router'

// Note the trailing slash, which is used to target index routes
export const Route = createFileRoute('/posts/')({
  component: PostsIndexComponent,
})

function PostsIndexComponent() {
  return <div>Please select a post!</div>
}
```

This route will be matched when the URL is `/posts` exactly.

## Dynamic Route Segments

Route path segments that start with a `$` followed by a label are dynamic and capture that section of the URL into the `params` object for use in your application. For example, a pathname of `/posts/123` would match the `/posts/$postId` route, and the `params` object would be `{ postId: '123' }`.

These params are then usable in your route's configuration and components! Let's look at a `posts.$postId.tsx` route:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  // In a loader
  loader: ({ params }) => fetchPost(params.postId),
  // Or in a component
  component: PostComponent,
})

function PostComponent() {
  // In a component!
  const { postId } = Route.useParams()
  return <div>Post ID: {postId}</div>
}
```

> 🧠 Dynamic segments work at **each** segment of the path. For example, you could have a route with the path of `/posts/$postId/$revisionId` and each `$` segment would be captured into the `params` object.

## Splat / Catch-All Routes

A route with a path of only `$` is called a "splat" route because it _always_ captures _any_ remaining section of the URL pathname from the `$` to the end. The captured pathname is then available in the `params` object under the special `_splat` property.

For example, a route targeting the `files/$` path is a splat route. If the URL pathname is `/files/documents/hello-world`, the `params` object would contain `documents/hello-world` under the special `_splat` property:

```js
{
  '_splat': 'documents/hello-world'
}
```

> ⚠️ In v1 of the router, splat routes are also denoted with a `*` instead of a `_splat` key for backwards compatibility. This will be removed in v2.

> 🧠 Why use `$`? Thanks to tools like Remix, we know that despite `*`s being the most common character to represent a wildcard, they do not play nice with filenames or CLI tools, so just like them, we decided to use `$` instead.

## Layout Routes

Layout routes are used to wrap child routes with additional components and logic. They are useful for:

- Wrapping child routes with a layout component
- Enforcing a `loader` requirement before displaying any child routes
- Validating and providing search params to child routes
- Providing fallbacks for error components or pending elements to child routes
- Providing shared context to all child routes
- And more!

Let's take a look at an example layout route called `app.tsx`:

```
routes/
├── app.tsx
├── app.dashboard.tsx
├── app.settings.tsx
```

In the tree above, `app.tsx` is a layout route that wraps two child routes, `app.dashboard.tsx` and `app.settings.tsx`.

This tree structure is used to wrap the child routes with a layout component:

```tsx
import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app')({
  component: AppLayoutComponent,
})

function AppLayoutComponent() {
  return (
    <div>
      <h1>App Layout</h1>
      <Outlet />
    </div>
  )
}
```

The following table shows which component(s) will be rendered based on the URL:

| URL Path         | Component                |
| ---------------- | ------------------------ |
| `/`              | `<Index>`                |
| `/app/dashboard` | `<AppLayout><Dashboard>` |
| `/app/settings`  | `<AppLayout><Settings>`  |

Since TanStack Router supports mixed flat and directory routes, you can also express your application's routing using layout routes within directories:

```
routes/
├── app/
│   ├── route.tsx
│   ├── dashboard.tsx
│   ├── settings.tsx
```

In this nested tree, the `app/route.tsx` file is a configuration for the layout route that wraps two child routes, `app/dashboard.tsx` and `app/settings.tsx`.

Layout Routes also let you enforce component and loader logic for Dynamic Route Segments:

```
routes/
├── app/users/
│   ├── $userId/
|   |   ├── route.tsx
|   |   ├── index.tsx
|   |   ├── edit.tsx
```

## Pathless Layout Routes

Like [Layout Routes](#layout-routes), Pathless Layout Routes are used to wrap child routes with additional components and logic. However, pathless layout routes do not require a matching `path` in the URL and are used to wrap child routes with additional components and logic without requiring a matching `path` in the URL.

Pathless Layout Routes are prefixed with an underscore (`_`) to denote that they are "pathless".

> 🧠 The part of the path after the `_` prefix is used as the route's ID and is required because every route must be uniquely identifiable, especially when using TypeScript so as to avoid type errors and accomplish autocomplete effectively.

Let's take a look at an example route called `_pathlessLayout.tsx`:

```

routes/
├── _pathlessLayout.tsx
├── _pathlessLayout.a.tsx
├── _pathlessLayout.b.tsx

```

In the tree above, `_pathlessLayout.tsx` is a pathless layout route that wraps two child routes, `_pathlessLayout.a.tsx` and `_pathlessLayout.b.tsx`.

The `_pathlessLayout.tsx` route is used to wrap the child routes with a Pathless layout component:

```tsx
import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_pathlessLayout')({
  component: PathlessLayoutComponent,
})

function PathlessLayoutComponent() {
  return (
    <div>
      <h1>Pathless layout</h1>
      <Outlet />
    </div>
  )
}
```

The following table shows which component will be rendered based on the URL:

| URL Path | Component             |
| -------- | --------------------- |
| `/`      | `<Index>`             |
| `/a`     | `<PathlessLayout><A>` |
| `/b`     | `<PathlessLayout><B>` |

Since TanStack Router supports mixed flat and directory routes, you can also express your application's routing using pathless layout routes within directories:

```
routes/
├── _pathlessLayout/
│   ├── route.tsx
│   ├── a.tsx
│   ├── b.tsx
```

However, unlike Layout Routes, since Pathless Layout Routes do match based on URL path segments, this means that these routes do not support [Dynamic Route Segments](#dynamic-route-segments) as part of their path and therefore cannot be matched in the URL.

This means that you cannot do this:

```
routes/
├── _$postId/ ❌
│   ├── ...
```

Rather, you'd have to do this:

```
routes/
├── $postId/
├── _postPathlessLayout/ ✅
│   ├── ...
```

## Non-Nested Routes

Non-nested routes can be created by suffixing a parent file route segment with a `_` and are used to **un-nest** a route from its parents and render its own component tree.

Consider the following flat route tree:

```
routes/
├── posts.tsx
├── posts.$postId.tsx
├── posts_.$postId.edit.tsx
```

The following table shows which component will be rendered based on the URL:

| URL Path          | Component                    |
| ----------------- | ---------------------------- |
| `/posts`          | `<Posts>`                    |
| `/posts/123`      | `<Posts><Post postId="123">` |
| `/posts/123/edit` | `<PostEditor postId="123">`  |

- The `posts.$postId.tsx` route is nested as normal under the `posts.tsx` route and will render `<Posts><Post>`.
- The `posts_.$postId.edit.tsx` route **does not share** the same `posts` prefix as the other routes and therefore will be treated as if it is a top-level route and will render `<PostEditor>`.

## Excluding Files and Folders from Routes

Files and folders can be excluded from route generation with a `-` prefix attached to the file name. This gives you the ability to colocate logic in the route directories.

Consider the following route tree:

```
routes/
├── posts.tsx
├── -posts-table.tsx // 👈🏼 ignored
├── -components/ // 👈🏼 ignored
│   ├── header.tsx // 👈🏼 ignored
│   ├── footer.tsx // 👈🏼 ignored
│   ├── ...
```

We can import from the excluded files into our posts route

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { PostsTable } from './-posts-table'
import { PostsHeader } from './-components/header'
import { PostsFooter } from './-components/footer'

export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  component: PostComponent,
})

function PostComponent() {
  const posts = Route.useLoaderData()

  return (
    <div>
      <PostsHeader />
      <PostsTable posts={posts} />
      <PostsFooter />
    </div>
  )
}
```

The excluded files will not be added to `routeTree.gen.ts`.

## Pathless Route Group Directories

Pathless route group directories use `()` as a way to group routes files together regardless of their path. They are purely organizational and do not affect the route tree or component tree in any way.

```
routes/
├── index.tsx
├── (app)/
│   ├── dashboard.tsx
│   ├── settings.tsx
│   ├── users.tsx
├── (auth)/
│   ├── login.tsx
│   ├── register.tsx
```

In the example above, the `app` and `auth` directories are purely organizational and do not affect the route tree or component tree in any way. They are used to group related routes together for easier navigation and organization.

The following table shows which component will be rendered based on the URL:

| URL Path     | Component     |
| ------------ | ------------- |
| `/`          | `<Index>`     |
| `/dashboard` | `<Dashboard>` |
| `/settings`  | `<Settings>`  |
| `/users`     | `<Users>`     |
| `/login`     | `<Login>`     |
| `/register`  | `<Register>`  |

As you can see, the `app` and `auth` directories are purely organizational and do not affect the route tree or component tree in any way.

# Virtual File Routes

> We'd like to thank the Remix team for [pioneering the concept of virtual file routes](https://www.youtube.com/watch?v=fjTX8hQTlEc&t=730s). We've taken inspiration from their work and adapted it to work with TanStack Router's existing file-based route-tree generation.

Virtual file routes are a powerful concept that allows you to build a route tree programmatically using code that references real files in your project. This can be useful if:

- You have an existing route organization that you want to keep.
- You want to customize the location of your route files.
- You want to completely override TanStack Router's file-based route generation and build your own convention.

Here's a quick example of using virtual file routes to map a route tree to a set of real files in your project:

```tsx
// routes.ts
import {
  rootRoute,
  route,
  index,
  layout,
  physical,
} from '@tanstack/virtual-file-routes'

export const routes = rootRoute('root.tsx', [
  index('index.tsx'),
  layout('pathlessLayout.tsx', [
    route('/dashboard', 'app/dashboard.tsx', [
      index('app/dashboard-index.tsx'),
      route('/invoices', 'app/dashboard-invoices.tsx', [
        index('app/invoices-index.tsx'),
        route('$id', 'app/invoice-detail.tsx'),
      ]),
    ]),
    physical('/posts', 'posts'),
  ]),
])
```

## Configuration

Virtual file routes can be configured either via:

- The `TanStackRouter` plugin for Vite/Rspack/Webpack
- The `tsr.config.json` file for the TanStack Router CLI

## Configuration via the TanStackRouter Plugin

If you're using the `TanStackRouter` plugin for Vite/Rspack/Webpack, you can configure virtual file routes by passing the path of your routes file to the `virtualRoutesConfig` option when setting up the plugin:

```tsx
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      target: 'react',
      virtualRouteConfig: './routes.ts',
    }),
    react(),
  ],
})
```

Or, you choose to define the virtual routes directly in the configuration:

```tsx
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { rootRoute } from '@tanstack/virtual-file-routes'

const routes = rootRoute('root.tsx', [
  // ... the rest of your virtual route tree
])

export default defineConfig({
  plugins: [TanStackRouterVite({ virtualRouteConfig: routes }), react()],
})
```

## Creating Virtual File Routes

To create virtual file routes, you'll need to import the `@tanstack/virtual-file-routes` package. This package provides a set of functions that allow you to create virtual routes that reference real files in your project. A few utility functions are exported from the package:

- `rootRoute` - Creates a virtual root route.
- `route` - Creates a virtual route.
- `index` - Creates a virtual index route.
- `layout` - Creates a virtual pathless layout route.
- `physical` - Creates a physical virtual route (more on this later).

## Virtual Root Route

The `rootRoute` function is used to create a virtual root route. It takes a file name and an array of children routes. Here's an example of a virtual root route:

```tsx
// routes.ts
import { rootRoute } from '@tanstack/virtual-file-routes'

export const routes = rootRoute('root.tsx', [
  // ... children routes
])
```

## Virtual Route

The `route` function is used to create a virtual route. It takes a path, a file name, and an array of children routes. Here's an example of a virtual route:

```tsx
// routes.ts
import { route } from '@tanstack/virtual-file-routes'

export const routes = rootRoute('root.tsx', [
  route('/about', 'about.tsx', [
    // ... children routes
  ]),
])
```

You can also define a virtual route without a file name. This allows to set a common path prefix for its children:

```tsx
// routes.ts
import { route } from '@tanstack/virtual-file-routes'

export const routes = rootRoute('root.tsx', [
  route('/hello', [
    route('/world', 'world.tsx'), // full path will be "/hello/world"
    route('/universe', 'universe.tsx'), // full path will be "/hello/universe"
  ]),
])
```

## Virtual Index Route

The `index` function is used to create a virtual index route. It takes a file name. Here's an example of a virtual index route:

```tsx
import { index } from '@tanstack/virtual-file-routes'

const routes = rootRoute('root.tsx', [index('index.tsx')])
```

## Virtual Pathless Route

The `layout` function is used to create a virtual pathless route. It takes a file name, an array of children routes, and an optional pathless ID. Here's an example of a virtual pathless route:

```tsx
// routes.ts
import { layout } from '@tanstack/virtual-file-routes'

export const routes = rootRoute('root.tsx', [
  layout('pathlessLayout.tsx', [
    // ... children routes
  ]),
])
```

You can also specify a pathless ID to give the route a unique identifier that is different from the filename:

```tsx
// routes.ts
import { layout } from '@tanstack/virtual-file-routes'

export const routes = rootRoute('root.tsx', [
  layout('my-pathless-layout-id', 'pathlessLayout.tsx', [
    // ... children routes
  ]),
])
```

## Physical Virtual Routes

Physical virtual routes are a way to "mount" a directory of good ol' TanStack Router File Based routing convention under a specific URL path. This can be useful if you are using virtual routes to customize a small portion of your route tree high up in the hierarchy, but want to use the standard file-based routing convention for sub-routes and directories.

Consider the following file structure:

```
/routes
├── root.tsx
├── index.tsx
├── pathless.tsx
├── app
│   ├── dashboard.tsx
│   ├── dashboard-index.tsx
│   ├── dashboard-invoices.tsx
│   ├── invoices-index.tsx
│   ├── invoice-detail.tsx
└── posts
    ├── index.tsx
    ├── $postId.tsx
    ├── $postId.edit.tsx
    ├── comments/
    │   ├── index.tsx
    │   ├── $commentId.tsx
    └── likes/
        ├── index.tsx
        ├── $likeId.tsx
```

Let's use virtual routes to customize our route tree for everything but `posts`, then use physical virtual routes to mount the `posts` directory under the `/posts` path:

```tsx
// routes.ts
export const routes = rootRoute('root.tsx', [
  // Set up your virtual routes as normal
  index('index.tsx'),
  layout('pathlessLayout.tsx', [
    route('/dashboard', 'app/dashboard.tsx', [
      index('app/dashboard-index.tsx'),
      route('/invoices', 'app/dashboard-invoices.tsx', [
        index('app/invoices-index.tsx'),
        route('$id', 'app/invoice-detail.tsx'),
      ]),
    ]),
    // Mount the `posts` directory under the `/posts` path
    physical('/posts', 'posts'),
  ]),
])
```

## Virtual Routes inside of TanStack Router File Based routing

The previous section showed you how you can use TanStack Router's File Based routing convention inside of a virtual route configuration.
However, the opposite is possible as well.  
You can configure the main part of your app's route tree using TanStack Router's File Based routing convention and opt into virtual route configuration for specific subtrees.

Consider the following file structure:

```
/routes
├── __root.tsx
├── foo
│   ├── bar
│   │   ├── __virtual.ts
│   │   ├── details.tsx
│   │   ├── home.tsx
│   │   └── route.ts
│   └── bar.tsx
└── index.tsx
```

Let's look at the `bar` directory which contains a special file named `__virtual.ts`. This file instructs the generator to switch over to virtual file route configuration for this directory (and its child directories).

`__virtual.ts` configures the virtual routes for that particular subtree of the route tree. It uses the same API as explained above, with the only difference being that no `rootRoute` is defined for that subtree:

```tsx
// routes/foo/bar/__virtual.ts
import {
  defineVirtualSubtreeConfig,
  index,
  route,
} from '@tanstack/virtual-file-routes'

export default defineVirtualSubtreeConfig([
  index('home.tsx'),
  route('$id', 'details.tsx'),
])
```

The helper function `defineVirtualSubtreeConfig` is closely modeled after vite's `defineConfig` and allows you to define a subtree configuration via a default export. The default export can either be

- a subtree config object
- a function returning a subtree config object
- an async function returning a subtree config object

## Inception

You can mix and match TanStack Router's File Based routing convention and virtual route configuration however you like.  
Let's go deeper!  
Check out the following example that starts off using File Based routing convention, switches over to virtual route configuration for `/posts`, switches back to File Based routing convention for `/posts/lets-go` only to switch over to virtual route configuration again for `/posts/lets-go/deeper`.

```
├── __root.tsx
├── index.tsx
├── posts
│   ├── __virtual.ts
│   ├── details.tsx
│   ├── home.tsx
│   └── lets-go
│       ├── deeper
│       │   ├── __virtual.ts
│       │   └── home.tsx
│       └── index.tsx
└── posts.tsx
```

## Configuration via the TanStack Router CLI

If you're using the TanStack Router CLI, you can configure virtual file routes by defining the path to your routes file in the `tsr.config.json` file:

```json
// tsr.config.json
{
  "virtualRouteConfig": "./routes.ts"
}
```

Or you can define the virtual routes directly in the configuration, while much less common allows you to configure them via the TanStack Router CLI by adding a `virtualRouteConfig` object to your `tsr.config.json` file and defining your virtual routes and passing the resulting JSON that is generated by calling the actual `rootRoute`/`route`/`index`/etc functions from the `@tanstack/virtual-file-routes` package:

```json
// tsr.config.json
{
  "virtualRouteConfig": {
    "type": "root",
    "file": "root.tsx",
    "children": [
      {
        "type": "index",
        "file": "home.tsx"
      },
      {
        "type": "route",
        "file": "posts/posts.tsx",
        "path": "/posts",
        "children": [
          {
            "type": "index",
            "file": "posts/posts-home.tsx"
          },
          {
            "type": "route",
            "file": "posts/posts-detail.tsx",
            "path": "$postId"
          }
        ]
      },
      {
        "type": "layout",
        "id": "first",
        "file": "layout/first-pathless-layout.tsx",
        "children": [
          {
            "type": "layout",
            "id": "second",
            "file": "layout/second-pathless-layout.tsx",
            "children": [
              {
                "type": "route",
                "file": "a.tsx",
                "path": "/route-a"
              },
              {
                "type": "route",
                "file": "b.tsx",
                "path": "/route-b"
              }
            ]
          }
        ]
      }
    ]
  }
}
```
