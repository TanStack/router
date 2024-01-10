---
id: external-data-loading
title: External Data Loading
---

> ⚠️ This guide is geared towards external state management libraries and their integration with TanStack Router for data fetching, ssr, hydration/dehydration and streaming. If you haven't read the standard [Data Loading](./guide/data-loading) guide

## To **Store** or to **Coordinate**?

While Router is very capable of storing and managing most data needs out of the box, sometimes you just might want something more robust!

Router is designed to be a perfect **coordinator** for external data fetching and caching libraries. This means that you can use any data fetching/caching library you want, and the router will coordinate the loading of your data in a way that aligns with your users' navigation and expectations of freshness.

## What data fetching libraries are supported?

Any data fetching library that supports asynchronous promises can be used with TanStack Router. This includes:

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

Literally any library that **can return a promise and read/write data** can be integrated.

## Using Loaders to ensure data is loaded

The easiest way to use integrate and external caching/data library into Router is to use `route.loader`s to ensure that the data required inside of a route has been loaded and is ready to be displayed.

> ⚠️ BUT WHY? It's very important to preload your critical render data in the loader for a few reasons:
>
> - No "flash of loading" states
> - No waterfall data fetching, caused by component based fetching
> - Better for SEO. If you data is available at render time, it will be indexed by search engines.

Here is a naive illustration (don't do this) of using a Route's `loader` option to seed the cache for some data:

```tsx
import { Route } from '@tanstack/react-router'

let postsCache = []

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  loader: async () => {
    postsCache = await fetchPosts()
  },
  component: () => {
    return (
      <div>
        {postsCache.map((post) => (
          <Post key={post.id} post={post} />
        ))}
      </div>
    )
  },
})
```

This example is **obviously flawed**, but illustrates the point that you can use a route's `loader` option to seed your cache with data. Let's take a look at a more realistic example using TanStack Query.

- Replace `fetchPosts` with your preferred data fetching library's prefetching API
- Replace `postsCache` with your preferred data fetching library's read-or-fetch API or hook

## A more realistic example using TanStack Query

Let's take a look at a more realistic example using TanStack Query.

```tsx
import { Route } from '@tanstack/react-router'

const postsQueryOptions = queryOptions({
  queryKey: 'posts',
  queryFn: () => fetchPosts,
})

const postsRoute = new Route({
  getParentPath: () => rootRoute,
  path: 'posts',
  // Use the `loader` option to ensure that the data is loaded
  loader: () => queryClient.ensureQueryData(postsQueryOptions),
  component: () => {
    // Read the data from the cache and subscribe to updates
    const posts = useSuspenseQuery(postsQueryOptions)

    return (
      <div>
        {posts.map((post) => (
          <Post key={post.id} post={post} />
        ))}
      </div>
    )
  },
})
```

## SSR Dehydration/Hydration

Tools that are able can integrate with TanStack Router's convenient Dehydration/Hydration APIs to shuttle dehydrated data between the server and client and rehydrate it where needed. Let's go over how to do this with both 3rd party critical data and 3rd party deferred data.

## Critical Dehydration/Hydration

**For critical data needed for the first render/paint**, TanStack Router supports **`dehydrate` and `hydrate`** options when configuring the `Router`. These callbacks are functions that are automatically called on the server and client when the router dehydrates and hydrates normally and allow you to augment the dehydrated data with your own data.

The `dehydrate` function can return any serializable JSON data which will get merged and injected into the dehydrated payload that is sent to the client. This payload is delivered via the `DehydrateRouter` component which, when rendered, provides the data back to you in the `hydrate` function on the client.

For example, let's dehydrate and hydrate a TanStack Query `QueryClient` so that our data we fetched on the server will be available for hydration on the client.

```tsx
// src/router.tsx

export function createRouter() {
  // Make sure you create your loader client or similar data
  // stores inside of your `createRouter` function. This ensures
  // that your data stores are unique to each request and
  // always present on both server and client.
  const queryClient = new QueryClient()

  return new Router({
    routeTree,
    // Optionally provide your loaderClient to the router context for
    // convenience (you can provide anything you want to the router
    // context!)
    context: {
      queryClient,
    },
    // On the server, dehydrate the loader client and return it
    // to the router to get injected into `<DehydrateRouter />`
    dehydrate: () => {
      return {
        queryClientState: dehydrate(queryClient),
      }
    },
    // On the client, hydrate the loader client with the data
    // we dehydrated on the server
    hydrate: (dehydrated) => {
      hydrate(client, dehydrated.queryClientState)
    },
    // Optionally, we can use `Wrap` to wrap our router in the loader client provider
    Wrap: ({ children }) => {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    },
  })
}
```

### 3rd Party Streaming with `transformStreamWithRouter`

- The `router.injectHtml` function
  - e.g. `router.injectHtml(() => '<script>console.log("Hello World!")</script>')`
  - This function can be called multiple times during rendering to inject arbitrary HTML markup into the stream.
  - Use it to inject things like `<script>` tags, `<style>` tags, or any other arbitrary HTML markup.
  - 🧠 Make sure you inject your HTML right after a successfully rendered Suspense boundary to ensure that the HTML is injected at the right time.
- The `router.dehydrateData` function
  - e.g. `router.dehydrateData('foo', () => ({ bar: 'baz' }))`
  - This function is a higher-level abstraction around `router.injectHtml`, designed for injecting JSON under a specific key. It can be called multiple times during rendering to inject arbitrary JSON data into the stream under a specific key which can be retrieved later on the client using the `router.hydrateData` function.
  - Use it to inject things like dehydrated data for your application.
  - 🧠 Make sure you inject your data right after a successfully rendered Suspense boundary to ensure that the data is injected in unison with the corresponding markup that requires it in the stream.
- The `router.hydrateData` function
  - e.g. `router.hydrateData('foo')`
  - This function is a companion to `router.dehydrateData`, designed for retrieving JSON data that was injected into the stream using `router.dehydrateData`.
  - Use it to retrieve things like dehydrated data for your application.
  - 🧠 Make sure you retrieve your data as early as possible on the client to ensure that it is available for hydration when your application renders.

Let's take a look at an example of how to use these utilities to stream a TanStack Router application.

### Injecting HTML

Now that we have a stream that is being transformed by our router, we can inject arbitrary HTML markup into the stream using the `router.injectHtml` function.

```tsx
function Test() {
  const router = useRouter()
  router.injectHtml(() => '<script>console.log("Hello World!")</script>')
  return null
}
```

### Dehydrating and Hydrating Deferred Data

Injecting HTML is pretty low-level, so let's use the `router.dehydrateData` and `router.hydrateData` functions to inject and retrieve some JSON data instead.

```tsx
function Custom() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Inner />
    </Suspense>
  )
}

let testCache: string

function Test() {
  const router = useRouter()

  // Attempt to rehydrate our data on the client
  // On the server, this is a no=op and
  // will return undefined
  const data = router.hydrateData('testCache')

  // Suspend and load our fake data
  if (!testCache) {
    throw new Promise((resolve) => {
      setTimeout(() => {
        testCache = Date.now()
        resolve()
      }, 1000)
    })
  }

  // Dehydrate our data on the server so it can
  // be rehydrated on the client
  router.dehydrateData('testCache', testCache)

  return data
}
```

### Providing Dehydration/Hydration utilities to external tools

The `router.dehydrateData` and `router.hydrateData` functions are designed to be used by external tools to dehydrate and hydrate data. For example, imagine an external data fetching library called `cool-cache` (not real) that allows for custom hydration and dehydration functions to be provided. We could use the `router.dehydrateData` and `router.hydrateData` functions to provide hydration and dehydration capabilities to `cool-cache`:

```tsx
// src/router.tsx

export function createRouter() {
  const coolCache = createCoolCache()

  const router = new Router({
    ...
  })

  coolCache.setHydrationFn((coolCacheEntry) =>
      router.hydrateData(coolCacheEntry.hashedKey))

  coolCache.setDehydrationFn((coolCacheEntry) =>
      router.dehydrateData(coolCacheEntry.hashedKey, () => coolCacheEntry))

  return router
}
```

This would allow `cool-cache` to be used with TanStack Router and have its data automatically hydrated and dehydrated with no extra work.

```tsx
// src/components/MyComponent.tsx

import * as React from 'react'

const coolCacheFetcher = createCoolCacheFetcher({
  key: 'todos',
  fetchFn: () => fetchTodos(),
})

export function Test() {
  // On the client, hydration would happen before `useCoolCacheFetcher` returns the data
  const data = useCoolCacheFetcher(coolCacheFetcher)
  // On the server, dehydration would happen after `useCoolCacheFetcher` is able to resolve the data

  return <>...</>
}
```
