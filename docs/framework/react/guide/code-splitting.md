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
  - Static Data
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

## Encapsulating a route's files into a directory

Since TanStack Router's file-based routing system is designed to support both flat and nested file structures, it's possible to encapsulate a route's files into a single directory without any additional configuration.

To encapsulate a route's files into a directory, move the route file itself into a `.route` file within a directory with the same name as the route file.

For example, if you have a route file named `posts.tsx`, you would create a new directory named `posts` and move the `posts.tsx` file into that directory, renaming it to `route.tsx`.

**Before**

- `posts.tsx`
- `posts.lazy.tsx`

**After**

- `posts`
  - `route.tsx`
  - `route.lazy.tsx`

## Using the `.lazy.tsx` suffix

If you're using the recommended [File-Based Routing](./route-trees.md) approach, code splitting is **as easy as moving your code into a separate file with a `.lazy.tsx` suffix** and use the `createLazyFileRoute` function instead of the `FileRoute` class or `createFileRoute` function.

Here are the options currently supported by the `createLazyFileRoute` function:

| Export Name         | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `component`         | The component to render for the route.                                |
| `errorComponent`    | The component to render when an error occurs while loading the route. |
| `pendingComponent`  | The component to render while the route is loading.                   |
| `notFoundComponent` | The component to render if a not-found error gets thrown.             |

### Exceptions to the `.lazy.tsx` rule

- The `__root.tsx` route file does not support code splitting, since it's always rendered regardless of the current route.

> ❓ Why can't I keep all of my route code in a single file? Can't you just code split that file?
>
> It's true, most popular frameworks support automatic code-extraction, but for now, TanStack Router is going to keep things simple by not getting into the business of parsing and extracting code from files. This also allows you to use any bundler you want, via the CLI, without having to worry about whether or not it supports our code extraction approach.
>
> In practice, we've found that **_splitting_ a file into 2 parts (critical and lazy) is the easy part**. The **harder part by far is wiring it all back together properly using lower-level lazy-loading APIs (not to mention doing that in a type-safe way)**.
>
> By keeping the splitting process manual and adhering to a simple set of conventions, there's less room for error and less cognitive overhead when working with code splitting.

### Example code splitting with `.lazy.tsx`

When you are using `.lazy.tsx` you can split your route into two files to enable code splitting:

**Before (Single File)**

```tsx
// src/routes/posts.tsx
import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from './api'

export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: Posts,
})

function Posts() {
  // ...
}
```

**After (Split into two files)**

This file would contain the critical route configuration:

```tsx
// src/routes/posts.tsx

import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from './api'

export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
})
```

With the non-critical route configuration going into the file with the `.lazy.tsx` suffix:

```tsx
// src/routes/posts.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/posts')({
  component: Posts,
})

function Posts() {
  // ...
}
```

## Using Virtual Routes

You might run into a situation where you end up splitting out everything from a route file, leaving it empty! In this case, simply **delete the route file entirely**! A virtual route will automatically be generated for you to serve as an anchor for your code split files. This virtual route will live directly in the generated route tree file.

**Before (Virtual Routes)**

```tsx
// src/routes/posts.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  // Hello?
})
```

```tsx
// src/routes/posts.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/posts')({
  component: Posts,
})

function Posts() {
  // ...
}
```

**After (Virtual Routes)**

```tsx
// src/routes/posts.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/posts')({
  component: Posts,
})

function Posts() {
  // ...
}
```

Tada! 🎉

## Using automatic code-splitting

> [!WARNING]
> This feature is experimental and currently in development. It is not recommended for production use.

When using the `experimental.enableCodeSplitting` feature, TanStack Router will automatically code split your route files based on the non-critical route configuration mentioned above.

The automatic code-splitting feature is **ONLY** available when you are using file-based routing with one of our [supported bundlers](./file-based-routing.md#prerequisites). This will **NOT** work if you are **only** using the CLI (`@tanstack/router-cli`).

To enable this feature, you can add the following to your `tsr.config.json`:

```json
{
  "experimental": {
    "enableCodeSplitting": true
  }
}
```

If you were previously using the `.lazy.tsx` suffix, you must remove it and let the automatic code-splitting feature take care of the rest. Your route files will now look like this:

**Before (Automatic Code Splitting using the `.lazy` suffix)**

```tsx
// src/routes/posts.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
})
```

```tsx
// src/routes/posts.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/posts')({
  component: Posts,
})

function Posts() {
  // ...
}
```

**After (Automatic Code Splitting without the `.lazy` suffix)**

```tsx
// src/routes/posts.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: Posts,
})

function Posts() {
  // ...
}
```

## Code-Based Splitting

### Manually Splitting Using `route.lazy()` and `createLazyRoute`

If you're not using the file-based routing system, you can still manually split your code using the `route.lazy()` method and the `createLazyRoute` function. You'd need to:

Create a lazy route using the `createLazyRoute` function.

```tsx
// src/posts.tsx
export const Route = createLazyRoute('/posts')({
  component: MyComponent,
})

function MyComponent() {
  return <div>My Component</div>
}
```

Then, call the `.lazy` method on the route definition in your `app.tsx` to import the lazy/code-split route with the non-critical route configuration.

```tsx
// src/app.tsx
const postsRoute = createRoute({
  getParent: () => rootRoute,
  path: '/posts',
}).lazy(() => import('./posts.lazy').then((d) => d.Route))
```

## Data Loader Splitting

> ⚠️ Splitting a data loader will incur 2 round trips to the server to retrieve the loader data. One round trip to load the loader code bundle itself and another to execute the loader code and retrieve the data. Do not proceed unless you are VERY sure that your loader is contributing to the bundle size enough to warrant these round trips.

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
