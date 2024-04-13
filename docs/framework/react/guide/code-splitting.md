---
title: Code Splitting
---

Code splitting and lazy loading is a powerful technique for improving the bundle size and load performance of an application.

- Reduces the amount of code that needs to be loaded on initial page load
- Code is loaded on-demand when it is needed
- Results in more chunks that are smaller in size that can be cached more easily by the browser.

## How does TanStack Router split code?

TanStack Router separates code into two categories:

- **Critical Route Configuration** - The code that is required to render the current route and kick off the data loading process as early as possible.

  - Path Parsing/Serialization
  - Search Param Validation
  - Loaders, Before Load
  - Route Context
  - Meta
  - Links
  - Scripts
  - Styles
  - All other route configuration not listed below

- **Non-Critical/Lazy Route Configuration** - The code that is not required to match the route, and can be loaded on-demand.
  - Route Component
  - Error Component
  - Pending Component
  - Not-found Component

> 🧠 **Why is the loader not split?**
>
> - The loader is already an asynchronous boundary, so you pay double to both get the chunk _and_ wait for the loader to execute.
> - Categorically, it is less likely to contribute to a large bundle size than a component.
> - The loader is one of the most important preloadable assets for a route, especially if you're using a default preload intent, like hovering over a link, so it's important for the loader to be available without any additional async overhead.

## Using the `.lazy.tsx` suffix

If you're using the recommended [File-Based Routing](../route-trees) approach, code splitting is **as easy as moving your code into a separate file with a `.lazy.tsx` suffix** and use the `createLazyFileRoute` function instead of the `FileRoute` class or `createFileRoute` function.

Here are the options currently supported by the `createLazyFileRoute` function:

| Export Name         | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `component`         | The component to render for the route.                                |
| `errorComponent`    | The component to render when an error occurs while loading the route. |
| `pendingComponent`  | The component to render while the route is loading.                   |
| `notFoundComponent` | The component to render if a not-found error gets thrown.             |

### Exceptions

- The `__root.tsx` route file does not support code splitting, since it's always rendered regardless of the current route.

> ❓ Why can't I keep all of my route code in a single file? Can't you just code split that file?
>
> It's true, most popular frameworks support automatic code-extraction, but for now, TanStack Router is going to keep things simple by not getting into the business of parsing and extracting code from files. This also allows you to use any bundler you want, via the CLI, without having to worry about whether or not it supports our code extraction approach.
>
> In practice, we've found that **_splitting_ a file into 2 parts (critical and lazy) is the easy part**. The **harder part by far is wiring it all back together properly using lower-level lazy-loading APIs (not to mention doing that in a type-safe way)**.
>
> By keeping the splitting process manual and adhering to a simple set of conventions, there's less room for error and less cognitive overhead when working with code splitting.

### Example

#### Before

- posts.tsx

  ```tsx
  import { createFileRoute } from '@tanstack/react-router'
  import { fetchPosts } from './api'

  export const Route = createFileRoute('/posts')({
    loader: fetchPosts,
    component: Posts,
  })

  function Posts () {
    ...
  }
  ```

#### After

- posts.tsx

  ```tsx
  import { createFileRoute } from '@tanstack/react-router'
  import { fetchPosts } from './api'

  export const Route = createFileRoute('/posts')({
    loader: fetchPosts,
  })
  ```

- posts.lazy.tsx

  ```tsx

  import { createLazyFileRoute } from '@tanstack/react-router'

  export const Route = createLazyFileRoute('/posts')({
    component: Posts,
  })

  function Posts () {
    ...
  }
  ```

### Encapsulating a route's files into a directory

Since TanStack Router's file-based routing system is designed to support both flat and nested file structures, it's possible to encapsulate a route's files into a single directory without any additional configuration.

To encapsulate a route's files into a directory, move the route file itself into a `.route` file within a directory with the same name as the route file.

For example, if you have a route file named `posts.tsx`, you would create a new directory named `posts` and move the `posts.tsx` file into that directory, renaming it to `route.tsx`.

#### Before

- `posts.tsx`
- `posts.lazy.tsx`

#### After

- `posts`
  - `route.tsx`
  - `route.lazy.tsx`

### Virtual Routes

You might run into a situation where you end up splitting out everything from a route file, leaving it empty! In this case, simply **delete the route file entirely**! A virtual route will automatically be generated for you to serve as an anchor for your code split files. This virtual route will live directly in the generated route tree file.

#### Before

- `posts.tsx`

  ```tsx
  import { createFileRoute } from '@tanstack/react-router'

  export const Route = createFileRoute('/posts')({
    // Hello?
  })
  ```

- `posts.lazy.tsx`

  ```tsx
  import { createLazyFileRoute } from '@tanstack/react-router'

  export const Route = createLazyFileRoute('/posts')({
    component: Posts,
  })

  function Posts() {
    // ...
  }
  ```

#### After

- `posts.lazy.tsx`

  ```tsx
  import { createLazyFileRoute } from '@tanstack/react-router'

  export const Route = createLazyFileRoute('/posts')({
    component: Posts,
  })

  function Posts() {
    // ...
  }
  ```

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

## Code-Based Splitting

### Manually Splitting Using `route.lazy()` and `createLazyRoute`

If you're not using the file-based routing system, you can still manually split your code using the `route.lazy()` method and the `createLazyRoute` function.

- `posts.tsx`

  ```tsx
  const route = createRoute({
    getParent: () => routeTree,
    path: '/posts',
  }).lazy(() => import('./posts.lazy').then((d) => d.Route))
  ```

- `posts.lazy.tsx`

  ```tsx
  export const Route = createLazyRoute('/posts')({
    component: MyComponent,
  })

  function MyComponent() {
    return <div>My Component</div>
  }
  ```

## Data Loader Splitting

> ⚠️ Splitting a data loader will incur 2 round trips to the server to retrieve the loader data. One round trip to load the loader code bundle itself and another to execute the loader code and retrieve the data. Do not proceed unless you are VERY sure that your loader is contributing the the bundle size enough to warrant these round trips.

You can code split your data loading logic using the Route's `loader` option. While this process makes it difficult to maintain type-safety with the parameters passed to your loader, you can always use the generic `LoaderContext` type to get most of the way there:

```tsx
import { LoaderContext } from '@tanstack/react-router'

const route = createRoute({
  path: '/my-route',
  component: MyComponent,
  loader: (...args) => import('./loader').then((d) => d.loader(...args)),
})

// In another file...
export const loader = async (context: LoaderContext) => {
  /// ...
}
```

This process can feel heavy-handed, so TanStack Router exports a utility called `lazyFn` which is very similar to `lazyRouteComponent` that can help simplify this process:

```tsx
import { lazyFn } from '@tanstack/react-router'

const route = createRoute({
  path: '/my-route',
  component: MyComponent,
  loader: lazyFn(() => import('./loader'), 'loader'),
})

// In another file...a
export const loader = async (context: LoaderContext) => {
  /// ...
}
```

## Manually accessing Route APIs in other files with the `RouteApi` class

As you might have guessed, placing your component code in a separate file than your route can make it difficult to consume the route itself. To help with this, TanStack Router exports a handy `getRouteApi` function that you can use to access a route's type-safe APIs in a file without importing the route itself.

- `my-route.tsx`

```tsx
import { createRoute } from '@tanstack/react-router'
import { MyComponent } from './MyComponent'

const route = createRoute({
  path: '/my-route',
  loader: () => ({
    foo: 'bar',
  }),
  component: MyComponent,
})
```

- `MyComponent.tsx`

```tsx
import { getRouteApi } from '@tanstack/react-router'

const route = getRouteApi('/my-route')

export function MyComponent() {
  const loaderData = route.useLoaderData()
  //    ^? { foo: string }

  return <div>...</div>
}
```

The `getRouteApi` function is useful for accessing other type-safe APIs:

- `useLoaderData`
- `useLoaderDeps`
- `useMatch`
- `useParams`
- `useRouteContext`
- `useSearch`
