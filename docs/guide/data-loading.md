---
title: Data Loading
---

Data loading is a common concern for web applications and is extremely related to routing. When loading any page for your app, it's ideal if all of the async requirements for those routes are fetched and fulfilled as early as possible and in parallel. The router is the best place to coordinate all of these async dependencies as it's usually the only place in your app that knows about where users are headed before content is rendered.

You may be familiar with `getServerSideProps` from Next.js or or `loaders` from Remix/React-Router. Both of these APIs assumes that **the router will store and manage your data**. This approach is great for use cases covered by both of those libraries, but TanStack Router is designed to function a bit differently than you're used to. Let's dig in!

## TanStack Router **should not store your data**.

Most routers that support data fetching will store and manage the data for you as you navigate. This is fine, but puts a large responsibility and stress on the router to handle [many cross-cutting and complex challenges that come with managing server-data, client-side caches and mutations](https://tanstack.com/query/latest/docs/react/overview#motivation).

## TanStack Router **orchestrates your data fetching**.

Instead of storing and managing your data, TanStack Router is designed to **coordinate** your data fetching. This means that you can use any data fetching library you want, and the router will coordinate the fetching of your data in a way that aligns with your users' navigation.

## What data fetching libraries are supported?

Any data fetching library that supports asynchronous dependencies can be used with TanStack Router. This includes:

- [TanStack Loaders](#tanstack-loaders)
- [TanStack Query](https://tanstack.com/query/latest/docs/react/overview)
- [SWR](https://swr.vercel.app/)
- [RTK Query](https://redux-toolkit.js.org/rtk-query/overview)
- [urql](https://formidable.com/open-source/urql/)
- [Relay](https://relay.dev/)
- [Apollo](https://www.apollographql.com/docs/react/)

Or, even...

- [Zustand](https://zustand-demo.pmnd.rs/)
- [Jotai](https://jotai.org/)
- [Recoil](https://recoiljs.org/)
- [Redux](https://redux.js.org/)

Literally any library that **can return a promise and read/write data** is supported.

## TanStack Loaders

Just because TanStack Router works with any data-fetching library doesn't mean we'd leave you empty handed! You may not always need all of the features of the above libraries (or you may not want to pay their cost in bundle size). This is why we created [TanStack Loaders](https://tanstack.com/loaders/latest/docs/overview)!

## Data Loading Basics

For the following examples, we'll show you the basics of data loading using **TanStack Loaders**, but as we've already mentioned, these same principles can be applied to any state management library worth it's salt. Let's get started!

## The `loader` route option

The `loader` route option is a function that is called **every time** a route is matched and loaded for:

- Navigating to a new route
- Refreshing the current route
- Preloading

Let's repeat that again. **Every time** someone navigates to a new route, refreshes the current route, or preloads a route, the matching routes' `onload` functions will be called.

> ⚠️ If you've used Remix or Next.js, you may be used to the idea that data loading only happens for routes on the page that _change_ when navigating. eg. If you were to navigate from `/posts` to `/posts/1`, the `loader`/`getServerSideProps `function for `/posts` would not be called again. This is not the case with TanStack Router. Every route's `loader` function will be called every time a route is loaded.

The biggest reason for calling `loader` every time is to notify your data loading library that data is or will be required. How your data loading library uses that information may vary, but obviously, this pattern is hopeful that your data fetching library can cache and refetch in the background. If you're using TanStack Loaders or TanStack Query, this is the default behavior.

Here is a simple example of using `loader` to fetch data for a route:

```tsx
import { Route } from '@tanstack/router'
import { Loader, useLoader } from '@tanstack/react-loaders'

const postsLoader = new Loader({
  key: 'posts',
  fn: async (params) => {
    const res = await fetch(`/api/posts`)
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
})

const loaderClient = new LoaderClient({
  loaders: [postsLoader],
})

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  fn: async () => {
    // Ensure our loader is loaded
    await loaderClient.load({ key: 'posts' })

    // Return a hook fn we can use in our component
    return () => useLoaderInstance({ key: 'posts' })
  },
  component: ({ useLoader }) => {
    // Access the hook we made in the loader function (and call it)
    const { data: posts } = useLoader()()

    return <div>...</div>
  },
})
```

## `loader` Parameters

The `loader` function receives a single parameter, which is an object with the following properties:

- `params` - The route's parsed path params
- `search` - The route's search query, parsed, validated and typed **including** inherited search params from parent routes
- `routeSearch` - The route's search query, parsed, validated and typed **excluding** inherited search params from parent routes
- `hash` - The route's hash
- `context` - The route's context object **including** inherited context from parent routes
- `routeContext` - The route's context object, **excluding** inherited context from parent routes
- `abortController` - The route's abortController. It's signal is cancelled when the route is unloaded or when the `loader` call becomes outdated.

Using these parameters, we can do a lot of cool things. Let's take a look at a few examples

## Using Path Params

The `params` property of the `loader` function is an object containing the route's path params.

```tsx
import { Route } from '@tanstack/router'
import { Loader, useLoader } from '@tanstack/react-loaders'

const postLoader = new Loader({
  key: 'post',
  // Accept a postId string variable
  fn: async (postId: string) => {
    const res = await fetch(`/api/posts/${postId}`)
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
})

const loaderClient = new LoaderClient({
  loaders: [postLoader],
})

const postRoute = new Route({
  getParentPath: () => postsRoute,
  path: '$postId',
  async loader({ params }) {
    // Load our loader
    await loaderClient.load({ key: 'post', variables: params.postId })
    // Return a hook fn we can use in our component
    return () => useLoaderInstance({ key: 'post', variables: params.postId })
  },
  component: ({ useLoader }) => {
    const { data: posts } = useLoader()()

    return <div>...</div>
  },
})
```

## Using Search Params

The `search` and `routeSearch` properties of the `loader` function are objects containing the route's search params. `search` contains _all_ of the search params including parent search params. `routeSearch` only includes specific search params from this route. In this example, we'll use zod to validate and parse the search params for `/posts/$postId` route and use them in an `onload` function and our component.

```tsx
import { Route } from '@tanstack/router'
import { Loader, useLoader } from '@tanstack/react-loaders'

const postsLoader = new Loader({
  key: 'posts',
  // Accept a page number variable
  fn: async (pageIndex: number) => {
    const res = await fetch(`/api/posts?page=${pageIndex}`)
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
})

const loaderClient = new LoaderClient({
  loaders: [postsLoader],
})

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  validateSearch: z.object({
    pageIndex: z.number().int().nonnegative().catch(0),
  }),
  async loader({ search }) {
    // Load our loader
    await loaderClient.load({ key: 'posts', variables: search.pageIndex })
    // Return a hook fn we can use in our component
    return () =>
      useLoaderInstance({ key: 'posts', variables: search.pageIndex })
  },
  component: ({ useLoader }) => {
    const { data: posts } = useLoader()()

    return <div>...</div>
  },
})
```

## Using Context

The `context` and `routeContext` properties of the `loader` function are objects containing the route's context. `context` is the context object for the route including context from parent routes. `routeContext` is the context object for the route excluding context from parent routes. In this example, we'll create a TanStack Loader `loaderClient` instance and inject it into our router's context. We'll then use that client in our `loader` function and our component.

> 🧠 Context is a powerful tool for dependency injection. You can use it to inject services, loaders, and other objects into your router and routes. You can also additively pass data down the route tree at every route using a route's `getContext` option.

```tsx
import { Route } from '@tanstack/router'
import { Loader, useLoader } from '@tanstack/react-loaders'

const postsLoader = new Loader({
  key: 'posts',
  fn: async () => {
    const res = await fetch(`/api/posts`)
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
})

const loaderClient = new LoaderClient({
  loader: [postsLoader],
})

// Create a new routerContext using new RouterContext<{...}>() class and pass it whatever types you would like to be available in your router context.

const routerContext = new RouterContext<{
  loaderClient: typeof loaderClient
}>()

// Then use the same routerContext to create your root route
const rootRoute = routerContext.createRootRoute()

// Notice how our postsRoute references context to get the loader client
// This can be a powerful tool for dependency injection across your router
// and routes.
const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  async loader({ context: { loaderClient } }) {
    await loaderClient.load({ key: 'posts' })
    return () => useLoaderInstance({ key: 'posts' })
  },
  component: ({ useLoader }) => {
    const { data: posts } = useLoader()()

    return <div>...</div>
  },
})

const routeTree = rootRoute.addChildren([postsRoute])

// Use your routerContext to create a new router
// This will require that you fullfil the type requirements of the routerContext
const router = new Router({
  routeTree,
  context: {
    // Supply our loaderClient to the router (and all routes)
    loaderClient,
  },
})
```

## Using the Abort Signal

The `abortControler` property of the `loader` function is an [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController). Its signal is cancelled when the route is unloaded or when the `loader` call becomes outdated. This is useful for cancelling network requests when the route is unloaded or when the route's params change. Here is an example using TanStack Loader's signal passthrough:

```tsx
import { Route } from '@tanstack/router'
import { Loader, useLoader } from '@tanstack/react-loaders'

const postsLoader = new Loader({
  key: 'posts',
  // Accept a page number variable
  fn: async (pageIndex: number, { signal }) => {
    const res = await fetch(`/api/posts?page=${pageIndex}`, { signal })
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
})

const loaderClient = new LoaderClient({
  loaders: [postsLoader],
})

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  async loader({ abortController }) {
    // Pass the route's signal to the loader
    await loaderClient.load({ key: 'posts', signal: abortController.signal })
    return () => useLoaderInstance({ key: 'posts' })
  },
  component: ({ useLoader }) => {
    const { data: posts } = useLoader()()

    return <div>...</div>
  },
})
```

## Using the `preload` flag

The `preload` property of the `loader` function is a boolean which is `true` when the route is being loaded via a preload action. Some data loading libraries may handle preloading differently than a standard fetch, so you may want to pass `preload` to your data loading library, or use it to execute the appropriate data loading logic. Here is an example using TanStack Loader and it's built-in `preload` flag:

```tsx
import { Route } from '@tanstack/router'
import { Loader, useLoader } from '@tanstack/react-loaders'

const postsLoader = new Loader({
  key: 'posts',
  fn: async () => {
    const res = await fetch(`/api/posts?page=${pageIndex}`)
    if (!res.ok) throw new Error('Failed to fetch posts')
    return res.json()
  },
})

const loaderClient = new LoaderClient({
  loaders: [postsLoader],
})

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  async loader({ preload }) {
    // Pass the route's preload to the loader
    await loaderClient.load({ key: 'posts', preload })
    return () => useLoaderInstance({ loader: postsLoader })
  },
  component: ({ useLoader }) => {
    const { data: posts } = useLoader()()

    return <div>...</div>
  },
})
```

> 🧠 TanStack Loaders uses the `preload` flag to determine cache freshness vs non-preload calls and also to determine if the global `isLoading` or `isPrefetching` flags should be incremented or not.

## Learn more about TanStack Loaders/Actions!

There's plenty more to learn about TanStack Loaders (and Actions!). If you plan on using them with TanStack Router, it's highly recommended that you read through their documentation:

- [TanStack Loaders](https://tanstack.com/loaders)
- [TanStack Actions](https://tanstack.com/actions)
