---
id: data-loading
title: Data Loading
---

Data loading is a common concern for web applications and is extremely related to routing. When loading any page for your app, it's ideal if all of the async requirements for those routes are fetched and fulfilled as early as possible and in parallel. The router is the best place to coordinate all of these async dependencies as it's usually the only place in your app that knows about where users are headed before content is rendered.

You may be familiar with `getServerSideProps` from Next.js or `loaders` from Remix/React-Router. TanStack Router is designed with similar functionality to preload assets on a per-route basis in parallel and optionally store and retrieve it in your components as well.

## TanStack Router's data loading lifecycle

Most application routers, if they support route loading at all, will fetch data for **new routes matches** as they enter the application during navigation. Consider the following navigation flow:

- The user lands in your app on the `/posts/123` pathname.
  - The following route structure is matched
    - /
      - posts
        - $postId
  - All of the loaders for all three routes for `/`, `/posts` and `/posts/$postId` load in parallel:
    - **Load** `/`
    - **Load** `/posts`
    - **Load** `/posts/$postId` (with `postId` === `123`)
- The user navigates to the `/posts/456` pathname
  - The following route structure is matched
    - /
      - posts
        - $postId
  - The `/` and `/posts` loaders are skipped because they have already been loaded.
  - The `$postId` match detects a change in params to `456` and the following loaders are called:
    - **Load** `/posts/$postId` (with `postId` === `123`)
- The user navigates to the `/` pathname
  - The following route structure is matched
    - /
  - The `/` loader is skipped because it has already been loaded.
- The user navigates to the `/posts` pathname
  - The following route structure is matched
    - /
      - posts
  - The `/` loader is skipped because it has already been loaded.
  - The `/posts` match is detected as new and the following loaders are called:
    - **Load** `/posts`

From the flow above, you'll notice that

- Route matches are, **by default, identified by their path params**
- Once a unique match is loaded, **by default, it is cached for `Infinity` until it is no longer in use (or invalidated)**
- When a route match is no longer in use, **by default, it is garbage collected immediately**.

## Atomic Defaults, Stale-While-Revalidate Capabilities

Defaults are what make tools great, but as you might have guessed, there are plenty of ways to configure route match caching and garbage collection. Let's go over some concepts and terminology.

- `maxAge` - The maximum amount of time in milliseconds a route match should be considered "fresh". Defaults to `Infinity`.
- `gcMaxAge` - The amount of time in milliseconds an **unused/inactive** route match will be held in memory before it is garbage collected. Defaults to `0`.
- `preloadMaxAge` - The amount of time in milliseconds an **unused/preloaded** route match will be held in memory before it is garbage collected. Defaults to `10_000`.

## Caching

Similar to TanStack Query, TanStack Router has some awesome caching utilities built-in, but **contrary to Query, Router has the following defaults**:

- `maxAge: Infinity`
- `gcMaxAge: 0`

This means that, **by default, all route matches are cached forever until they are no longer in use at which point they are garbage collected immediately**. This is a great default for most applications using the router as a data fetcher since it compliments nested routing patterns and meets the user at their expectations that **only the parts of the screen change will be loaded**. These options can be changed though!

## Route Caching Options

The following options can modify the caching behavior of a route match:

- `maxAge`
- `gcMaxAge`
- `preloadMaxAge`

## Router-wide Caching Options

The following options can modify the default behavior of all route matches:

- `defaultMaxAge`
- `defaultGcMaxAge`
- `defaultPreloadMaxAge`

## Route Loaders

Route loaders are functions that are called when a route match is loaded. They are called with a single parameter which is an object containing many helpful properties. We'll go over those in a bit, but first, let's look at an example of a route loader:

```tsx
import { Route } from '@tanstack/react-router'

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  loader: async () => {
    // Load our posts
    const res = await fetch(`/api/posts`)
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
})
```

The data returned from the loader is stored in a unique `RouteMatch` that is identified by the route's `fullPath` and optionally, the result of the `routeOptions.loaderContext` function, which is required to use any path params, search params or hash in a loader. This ensures that routes with the same `fullPath` but different variables e.g. `/posts?page=1` and `/posts?page=2` are stored separately. In the case above, the pathName is sufficient to uniquely identify the route and it doesn't need any access to path params, search params or hash, so `loaderContext` is not required.

## `loader` Parameters

The `loader` function receives a single object with the following properties:

- `context` - The route's context object, which is a merged union of:
  - Parent route context
  - This route's context as provided by the `beforeLoad` option
  - This route's loader context as provided by the `loaderContext` option
- `abortController` - The route's abortController. Its signal is cancelled when the route is unloaded or when the `loader` call becomes outdated.

Using these parameters, we can do a lot of cool things. Let's take a look at a few examples

## Using Router Context

The `context` argument passed to the `loader` function is an object containing a merged union of:

- Parent route context
- This route's context as provided by the `beforeLoad` option
- This route's loader context as provided by the `loaderContext` option

Starting at the very top of the router, you can pass an initial context to the router via the `context` option. This context will be available to all routes in the router and get copied and extended by each route as they are matched. This happens by passing a context to a route via the `beforeLoad` option. This context will be available to all child routes of the route. Finally, you can pass a context to a route via the `loaderContext` option. This context will be available to the route's loader.

In this example, we'll create a function in our route context to fetch posts, then use it in our loader.

> 🧠 Context is a powerful tool for dependency injection. You can use it to inject services, loaders, and other objects into your router and routes. You can also additively pass data down the route tree at every route using a route's `beforeLoad` option.

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
  loader({ context: { fetchPosts } }) => fetchPosts(),
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

To use path params in your loader, access them via the `params` property on the loader's parameters. Here's an example:

```tsx
import { Route } from '@tanstack/react-router'

const postRoute = new Route({
  getParentPath: () => postsRoute,
  path: '$postId',
  loader: ({ params: { postId } }) => {
    const res = await fetch(`/api/posts/${postId}`)
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
})
```

## Using Route Context

Passing down global context to your router is great, but what if you want to provide context that is specific to a route? This is where the `beforeLoad` option comes in. The `beforeLoad` option is a function that runs right before attempting to load a route and receives the same `loader` parameters. Beyond its ability to redirect potential matches, it can also return an object that will be merged into the route's context. Let's take a look at an example where we provide `fetchPosts` to our route context via the `beforeLoad` option:

```tsx
import { Route } from '@tanstack/react-router'

const fetchPosts = async () => {
  const res = await fetch(`/api/posts?page=${pageIndex}`)
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
}

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  // Pass the fetchPosts function to the route context
  beforeLoad: () => ({ fetchPosts }),
  loader({ context: { fetchPosts } }) => fetchPosts(),
})
```

## Using Search Params

Search parameters can be accessed via the `loaderContext` function. The `loaderContext`'s `search` property contains _all_ of the search params including parent search params, of which you can choose which search params you specifically rely on in your loader. In this example, we'll use zod to validate and parse the search params for the `/posts` route that uses pagination, then pass them and use them in our loader.

```tsx
import { Route } from '@tanstack/react-router'

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  // Use zod to validate and parse the search params
  validateSearch: z.object({
    pageIndex: z.number().int().nonnegative().catch(0),
  }),
  // Pass the pageIndex to the loader context
  loaderContext: ({ search: { pageIndex } }) => ({ pageIndex }),
  // Use the pageIndex from context in the loader
  loader: async ({ context: { pageIndex } }) => {
    const res = await fetch(`/api/posts?page=${pageIndex}`)
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
})
```

## Using the Abort Signal

The `abortController` property of the `loader` function is an [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController). Its signal is cancelled when the route is unloaded or when the `loader` call becomes outdated. This is useful for cancelling network requests when the route is unloaded or when the route's params change. Here is an example using it with a fetch call:

```tsx
import { Route } from '@tanstack/react-router'

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  loader: ({ abortController }) => {
    const res = await fetch(`/api/posts?page=${pageIndex}`, {
      signal: abortController.signal,
    })
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
})
```

## Using the `preload` flag

The `preload` property of the `loader` function is a boolean which is `true` when the route is being preloaded instead of loaded. Some data loading libraries may handle preloading differently than a standard fetch, so you may want to pass `preload` to your data loading library, or use it to execute the appropriate data loading logic. Here is an example using TanStack Loaders and its built-in `preload` flag:

```tsx
import { Route } from '@tanstack/react-router'

// Create a new loader
const postsLoader = new Loader({
  key: 'posts',
  fn: async (params) => {
    const res = await fetch(`/api/posts`)
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
})

// Create a new loader client
const loaderClient = new LoaderClient({
  loaders: [postsLoader],
})

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  loader: async ({ preload }) => {
    // Passing the preload flag to the loader client
    // will enforce slightly different caching behavior
    // in TanStack Loaders caching logic
    await loaderClient.load({ key: 'posts', preload })
  },
  component: ({ useLoader }) => {
    const { data: posts } = useLoaderInstance({ key: 'posts' })

    return <div>...</div>
  },
})
```

## Retrieving Loader Data

The data returned from the loader can be retrieved a few different ways:

- The `props.useLoader` hook
- The `route.useLoader` hook
- The `useLoader` hook

Each is available to allow access to the loader data at different contexts and are in order from simplest to most flexible.

Let's retrieve the data from our loader using the `props.useLoader` hook:

```tsx
import { Route } from '@tanstack/react-router'

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  loader: async () => {
    // ...
  },
  component: ({ useLoader }) => {
    const posts = useLoader()
    return <div>...</div>
  },
})
```

## Stale-While-Revalidate

By manipulating the `maxAge` option, we can create a stale-while-revalidate pattern for our route matches and their loaders. This is useful for routes that may have frequently changing data caused by external events. Let's take a look at an example:

```tsx
import { Route } from '@tanstack/react-router'

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  loader: async () => {
    // Load our posts
    const res = await fetch(`/api/posts`)
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
  maxAge: 10_000,
})
```

This route's `maxAge` is set to `10_000` milliseconds (10 seconds). This means that the route match data will be considered "fresh" for 10 seconds.

- If the route is loaded again **within** 10 seconds, the cached data will be returned immediately and the loader will not be called.
- If the route is loaded again **after** 10 seconds, the cached data will be returned immediately and the loader will be called again in the background to refresh the data.

## Using Match State

Enabling patterns like `stale-while-revalidate` is great, but what if we want to know when our data is stale? This is where the match state comes in. Match state is available via a few different hooks:

- `props.useMatch`
- `route.useMatch`
- `useMatch`

They are ordered from simplest to most flexible.

The result of these hooks has a lot of useful information about a route match, but on the topic of `stale-while-revalidate`, one property is particularly useful:

- `isFetching`
  - `boolean`

This property is `true` when the route match is being loaded and `false` when it is not. This means that we can use it to display to our users that this particular route's loader data is being refreshed in the background. Let's take a look at an example:

```tsx
import { Route } from '@tanstack/react-router'

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  loader: async () => {
    // ...
  },
  maxAge: 10_000,
  component: ({ useMatch }) => {
    const { isFetching } = useMatch()
    return <div>
      {isFetching ? Loading... : null}
      ...
    </div>
  },
})
```

## Loader Invalidation

By default, route matches are never considered stale and garbage collected when they are no longer in use. This is great mostly for loaders that only change when navigation occurs, but what about loaders that change when user events occur?

Our apps often contain events that could modify the results of our loaders. For example, a user may create a new post, or a user may delete a post. In these cases, we would want to invalidate the loader data for `/posts` and `/posts/$postId` so the user will see the latest data.

The easiest way to do this is by **invalidating all route matches with `router.invalidate`**:

```tsx
function App() {
  const router = useRouter

  const mutate = () => {
    //... some mutation logic
    router.invalidate()
  }
}
```

`router.invalidate` will invalidate all route matches and **by default, reload the currently matched routes**. For any route matches that are not currently in use and not garbage collected, they will be marked as invalid and their loader will be called again when they are matched or preloaded.

## Invalidating Specific Route Matches

If you want to invalidate specific route matches, you can use the same `router.invalidate` method, but pass a `matchId` option to it:

```tsx
function App() {
  const router = useRouter

  const mutate = () => {
    //... some mutation logic
    router.invalidate({ matchId: '/posts' })
  }
}
```
