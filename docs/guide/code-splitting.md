---
title: Code Splitting
---

Code splitting is a powerful technique for improving the bundle size and load performance of an application.

- Reduces the amount of code that needs to be loaded on initial page load
- Code is loaded on-demand when it is needed
- Results in more chunks that are smaller in size that can be cached more easily by the browser.

## Easier Code Splitting with File-based Routing

If you're using the recommended [File-Based Routing](../guide/route-trees.md) approach, code splitting is **as easy as moving your code into a separate file with a specific suffix and corresponding export**.

Here is a list of the supported route options that can be code-split with their corresponding file-extension and export name:

| Route Property     | Suffix                  | Named Export       |
| ------------------ | ----------------------- | ------------------ |
| `component`        | `.component.tsx`        | `component`        |
| `errorComponent`   | `.errorComponent.tsx`   | `errorComponent`   |
| `pendingComponent` | `.pendingComponent.tsx` | `pendingComponent` |
| `loader`           | `.loader.ts`            | `loader`           |

> ❓ Why can't I keep all of my route code in a single file? Can't you just code split that file?
>
> It's true, most popular frameworks support automatic code-extraction, but for now, TanStack Router is going to keep things simple.
>
> In practice, we've found that **_splitting_ a file into multiple files is the easy part**. The **harder part by far is wiring it all back together properly using lower-level lazy-loading APIs (not to mention doing that in a type-safe way)**.
>
> By keeping the splitting process manual and adhering to a simple set of conventions, there's less room for error and less cognitive overhead when working with code splitting.

### Example: Splitting a route's component

#### Before

```tsx
// posts.$postId.tsx

import { Route } from '@tanstack/react-router'
import { fetchPosts } from './api'

export const Route = new Route({
  loader: fetchPosts,
  component: Posts,
})

function Posts () {
  ...
}
```

#### After

```tsx
// posts.tsx

import { Route } from '@tanstack/react-router'
import { fetchPosts } from './api'

export const Route = new Route({
  loader: fetchPosts,
})
```

```tsx
// posts.component.tsx

export const component = function Posts () {
  ...
}
```

### Example: Splitting a route's loader

If you have a route file named `posts.tsx`, you would create a new file named `posts.loader.ts` and move the loader into that file.

#### Before

```tsx
// posts.tsx

import { Route } from '@tanstack/react-router'
import { fetchPosts } from './api'

export const Route = new Route({
  loader: fetchPosts,
  component: Posts,
})

function Posts () {
  ...
}
```

#### After

```tsx
// posts.tsx

import { Route } from '@tanstack/react-router'

export const Route = new Route({
  component: Posts,
})

function Posts () {
  ...
}
```

```tsx
// posts.loader.ts

import { fetchPosts } from './api'

export const loader = fetchPosts
```

### Encapsulating a route's files into a directory

Since TanStack Router's file-based routing system is designed to support both flat and nested file structures, it's possible to encapsulate a route's files into a single directory without any additional configuration.

To encapsulate a route's files into a directory, move the route file itself into a `.route` file within a directory with the same name as the route file.

For example, if you have a route file named `posts.tsx`, you would create a new directory named `posts` and move the `posts.tsx` file into that directory, renaming it to `index.route.tsx`.

#### Before

- `posts.tsx`
- `posts.component.tsx`
- `posts.errorComponent.tsx`
- `posts.loader.ts`

#### After

- `posts`
  - `route.tsx`
  - `component.tsx`
  - `errorComponent.tsx`
  - `loader.ts`

### Virtual Routes

You might run into a situation where you end up splitting out everything from a route file, leaving it empty! For example:

#### Before

- `posts.tsx`

  ```tsx
  import { Route } from '@tanstack/react-router'

  export const Route = new Route({
    // Hello?
  })
  ```

- `posts.component.tsx`
- `posts.loader.ts`

In this case, actually **remove the route file entirely**! The CLI will automatically generate a virtual route for you to serve as an anchor for your code split files. This virtual route will live directly in the generated route tree file.

#### After

- `posts.component.tsx`
- `posts.loader.ts`

Tada! 🎉

## Route Inclusion / Exclusion

Via the `routeFilePrefix` and `routeFileIgnorePrefix` options, the CLI can be configured to only include files and directories that start with a specific prefix, or to ignore files and directories that start with a specific prefix. This is especially useful when mixing non-route files with route files in the same directory, or when using a flat structure and wanting to exclude certain files from routing.

## Route Inclusion Example

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

## Route Exclusion Example

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

## Using `lazyRouteComponent`

Synchronous components are usually defined as functions and passed to the `route.component` option:

```tsx
function MyComponent() {
  return <div>My Component</div>
}

const route = new Route({
  component: MyComponent,
})
```

But with TanStack Router, a route component can have a static `preload` method attached to it which will get called and awaited when the route is preloaded and/or loaded.

If we were to set this up manually **(don't do this)**, it would look something like this:

```tsx
const MyComponent = React.lazy(() => import('./MyComponent'))

MyComponent.preload = async () => {
  await import('./MyComponent')
}

const route = new Route({
  component: MyComponent,
})
```

This is a bit noisy and repetitive, so TanStack Router exports a `lazyRouteComponent` wrapper that you can use to simplify this process:

```tsx
import { lazyRouteComponent } from '@tanstack/react-router'

const route = new Route({
  component: lazyRouteComponent(() => import('./MyComponent')),
})
```

The `lazyRouteComponent` wrapper not only implements `React.lazy()` under the hood, but automatically sets up the component with a preload method and promise management for you.

### Handling Named exports with `lazyRouteComponent`

The `lazyRouteComponent` wrapper also allows you to easily load components that are named exports from a module. To use this functionality, provide the name of the exported component as a second argument to the function:

```tsx
const route = new Route({
  component: lazyRouteComponent(() => import('./MyComponent'), 'NamedExport'),
})
```

`lazyRouteComponent` is also type safe, to ensure that you are only able to provide valid named exports from the module, which helps prevent runtime errors.

## Data Loader Splitting

You may end up with a lot of data loaders that could potentially contribute to a large bundle size. If this is the case, you can code split your data loading logic using the Route's `loader` option. While this process makes it difficult to maintain type-safety with the parameters passed to your loader, you can always use the generic `LoaderContext` type to get most of the way there:

```tsx
import { LoaderContext } from '@tanstack/react-router'

const route = new Route({
  path: '/my-route',
  component: MyComponent,
  loader: (...args) => import('./loader').then((d) => d.loader(...args)),
})

// In another file...
export const loader = async (context: LoaderContext) => {
  /// ...
}
```

Again, this process can feel heavy-handed, so TanStack Router exports another utility called `lazyFn` which is very similar to `lazyRouteComponent` that can help simplify this process:

```tsx
import { lazyFn } from '@tanstack/react-router'

const route = new Route({
  path: '/my-route',
  component: MyComponent,
  loader: lazyFn(() => import('./loader'), 'loader'),
})

// In another file...a
export const loader = async (context: LoaderContext) => {
  /// ...
}
```

## Accessing Route APIs in Code Split Files with the `RouteApi` class

As you might have guessed, importing the very route that is already importing the code-split file you're in is a circular dependency, both in types and at runtime. To avoid this, TanStack Router exports a handy `RouteApi` class that you can use to access a route's type-safe APIs:

```tsx
import { Route } from '@tanstack/react-router'

const route = new Route({
  path: '/my-route',
  loader: () => ({
    foo: 'bar',
  }),
  component: lazyRouteComponent(() => import('./my-component'), 'MyComponent'),
})

// In my-component.tsx
import { RouteApi } from '@tanstack/react-router'

const routeApi = new RouteApi({ id: '/my-route' })

export function MyComponent() {
  const loaderData = routeApi.useLoaderData()
  //    ^? { foo: string }

  return <div>...</div>
}
```

The `RouteApi` class is also useful for accessing other type-safe APIs:

- `useLoaderData`
- `useMatch`
- `useParams`
- `useRouteContext`
- `useSearch`
