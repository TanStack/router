---
id: data-loading
title: Data Loading
---

Data loading is a common concern for web applications and is extremely related to routing. When loading any page for your app, it's ideal if all of the async requirements for those routes are fetched and fulfilled as early as possible and in parallel. The router is the best place to coordinate all of these async dependencies as it's usually the only place in your app that knows about where users are headed before content is rendered.

You may be familiar with `getServerSideProps` from Next.js or `loader`s from Remix/React-Router. TanStack Router is designed with similar functionality to preload assets on a per-route basis in parallel allowing React to render as it fetches via suspense.

## The route loading lifecycle

Every time a URL/history update is detected, the router the following sequence is executed:

- Route Matching (Top-Down)
  - `route.parseParams`
  - `route.validateSearch`
- Route Pre-Loading (Serial)
  - `route.beforeLoad`
  - `route.onError`
- Route Loading (Parallel)
  - `route.component.preload?`
  - `route.loader`

## URL Update/Loading Frequency

Similar to TanStack Query, TanStack router errs on the side of thorough and truthful events about when the URL changes and when routes are matched and loaded. This means that your routes' **beforeLoad** and **loader** function could potentially be called at the speed at which the URL changes. This includes:

- User Navigation
- History Back/Forward Actions
- History Push/Replace Actions
- Search Parameter updates
- Hash updates

Whatever you do in these route option function should be prepared to depupe and/or cancel any async operations that are no longer relevant. This is especially important for loaders that make expensive network requests.

## No Caching

Heads up! TanStack Router **does not provide loader data caching out of the box**, but **is designed to work well with data caches like TanStack Query, SWR, etc.**

## Route `loader`s

Route `loader` functions are called when a route match is loaded. They are called with a single parameter which is an object containing many helpful properties. We'll go over those in a bit, but first, let's look at an example of a route `loader` function:

```tsx
import { Route } from '@tanstack/react-router'

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  loader: () => fetchPosts(),
})
```

## `loader` Parameters

The `loader` function receives a single object with the following properties:

- `params` - The route's path params
- `search` - The route's search params
- `context` - The route's context object, which is a merged union of:
  - Parent route context
  - This route's context as provided by the `beforeLoad` option
- `abortController` - The route's abortController. Its signal is cancelled when the route is unloaded or when the Route is no longer relevant and the current invocation of the `loader` function becomes outdated.
- `navigate` - A function that can be used to navigate to a new location
- `location` - The current location

Using these parameters, we can do a lot of cool things. Let's take a look at a few examples

## Using Router Context

The `context` argument passed to the `loader` function is an object containing a merged union of:

- Parent route context
- This route's context as provided by the `beforeLoad` option

Starting at the very top of the router, you can pass an initial context to the router via the `context` option. This context will be available to all routes in the router and get copied and extended by each route as they are matched. This happens by passing a context to a route via the `beforeLoad` option. This context will be available to all child routes of the route. The resulting context will be available to the route's `loader` function.

In this example, we'll create a function in our route context to fetch posts, then use it in our `loader` function.

> 🧠 Context is a powerful tool for dependency injection. You can use it to inject services, hooks, and other objects into your router and routes. You can also additively pass data down the route tree at every route using a route's `beforeLoad` option.

```tsx
import { Route } from '@tanstack/react-router'

const fetchPosts = async () => {
  const res = await fetch(`/api/posts?page=${pageIndex}`)
  if (!res.ok) throw new Error('Failed to fetch posts')
  return res.json()
}

// Create a new routerContext using new rootRouteWithContext<{...}>() function and pass it whatever types you would like to be available in your router context.
const rootRoute = rootRouteWithContext<{
  fetchPosts: typeof fetchPosts
}>()() // NOTE: the double call is on purpose, since rootRouteWithContext is a factory ;)

// Notice how our postsRoute references context to get our fetchPosts function
// This can be a powerful tool for dependency injection across your router
// and routes.
const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  loader: ({ context: { fetchPosts } }) => fetchPosts(),
})

const routeTree = rootRoute.addChildren([postsRoute])

// Use your routerContext to create a new router
// This will require that you fullfil the type requirements of the routerContext
const router = new Router({
  routeTree,
  context: {
    // Supply the fetchPosts function to the router context
    fetchPosts,
  },
})
```

## Using Path Params

To use path params in your `loader` function, access them via the `params` property on the function's parameters. Here's an example:

```tsx
import { Route } from '@tanstack/react-router'

const postRoute = new Route({
  getParentPath: () => postsRoute,
  path: '$postId',
  loader: ({ params: { postId } }) => fetchPostById(postId),
})
```

## Using Route Context

Passing down global context to your router is great, but what if you want to provide context that is specific to a route? This is where the `beforeLoad` option comes in. The `beforeLoad` option is a function that runs right before attempting to load a route and receives the same `loader` function parameters. Beyond its ability to redirect potential matches, it can also return an object that will be merged into the route's context. Let's take a look at an example where we provide `fetchPosts` to our route context via the `beforeLoad` option:

```tsx
import { Route } from '@tanstack/react-router'

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  // Pass the fetchPosts function to the route context
  beforeLoad: () => ({
    fetchPosts: () => {
      // ...
    },
  }),
  loader: ({ context: { fetchPosts } }) => fetchPosts(),
})
```

## Using Search Params

Search parameters can be accessed via the `beforeLoad` and `loader` functions. The `search` property provided to these functions contains _all_ of the search params including parent search params. In this example, we'll use zod to validate and parse the search params for the `/posts` route that uses pagination, then use them in our `loader` function.

```tsx
import { Route } from '@tanstack/react-router'

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  // Use zod to validate and parse the search params
  validateSearch: z.object({
    offset: z.number().int().nonnegative().catch(0),
  }),
  // Use the offset from context in the loader function
  loader: async ({ search: { offset } }) =>
    fetchPosts({
      offset,
    }),
})
```

## Using the Abort Signal

The `abortController` property of the `loader` function is an [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController). Its signal is cancelled when the route is unloaded or when the `loader` call becomes outdated. This is useful for cancelling network requests when the route is unloaded or when the route's params change. Here is an example using it with a fetch call:

```tsx
import { Route } from '@tanstack/react-router'

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  loader: ({ abortController }) =>
    fetchPosts({
      // Pass this to an underlying fetch call or anything that supports signals
      signal: abortController.signal,
    }),
})
```

## Using the `preload` flag

The `preload` property of the `loader` function is a boolean which is `true` when the route is being preloaded instead of loaded. Some data loading libraries may handle preloading differently than a standard fetch, so you may want to pass `preload` to your data loading library, or use it to execute the appropriate data loading logic:

```tsx
import { Route } from '@tanstack/react-router'

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  loader: async ({ preload }) =>
    fetchPosts({
      maxAge: preload ? 10_000 : 0, // Preloads should hang around a bit longer
    }),
})
```
