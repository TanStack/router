---
id: deferred-data-loading
title: Deferred Data Loading
---

Deferred data loading is a pattern that allows the router to begin rendering the next location's critical route data while slower, non-critical route data is resolved in the background. This process works on both the client and server (via streaming) and is a great way to improve the perceived performance of your application.

## Deferred Data Loading with `defer` and `Await`

To defer slow or non-critical data, wrap an **unawaited/unresolved** promise in the `defer` function and return it anywhere in your loader response:

```tsx
// src/routes/posts/$postId.tsx

import * as React from 'react'
import { defer } from '@tanstack/react-router'

export const postIdRoute = new Route('post', {
  // ...
  load: () => {
    // Fetch some slower data, but do not await it
    const slowDataPromise = fetchSlowData()

    // Fetch and await some data that resolves quickly
    const fastData = await fetchFastData()

    return {
      // Wrap the slow promise in `defer()`
      slowData: defer(slowDataPromise),
    }
  },
})
```

As soon as any awaited promises are resolved, the next next route will begin rendering while the deferred promises continue to resolve.

In the component, deferred promises can be resolved and utilized using the `Await` component:

```tsx
// src/routes/posts/$postId.tsx

import * as React from 'react'
import { Await } from '@tanstack/react-router'

export const postIdRoute = new Route('post', {
  // ...
  component: ({ useLoader }) => {
    const { slowData } = useLoader()

    return (
      <Suspense fallback={<div>Loading...</div>}>
        <Await promise={slowData}>
          {(data) => {
            return <div>{data}</div>
          }}
        </Await>
      </Suspense>
    )
  },
})
```

The `Await` component resolves the promise by triggering the nearest suspense boundary until it is resolved, after which it renders the component's `children` as a function with the resolved data.

If the promise is rejected, the `Await` component will throw the serialized error, which can be caught by the nearest error boundary.

## Caching and Invalidation

Streamed promises follow the same lifecycle as the loader data they are associated with including maxAge, gcMaxAge, invalidation, etc.

They can even be preloaded!

## SSR & Streaming Deferred Data

**Streaming requires a server that supports it and for TanStack Router to be configured to use it properly.**

Please read the entire [SSR Guide](/docs/guide/server-streaming) for step by step instructions on how to set up your server for streaming.

## SSR Streaming Lifecycle

The following is a high-level overview of how deferred data streaming works with TanStack Router:

- Server
  - Promises wrapped in `defer()` are marked and tracked as they are returned from route loaders
  - All loaders resolve and any deferred promises are serialized and embedded into the html
  - The route begins to render
  - Deferred promises rendered with the `<Await>` component trigger suspense boundaries, allowing the server to stream html up to that point
- Client
  - The client receives the initial html from the server
  - `<Await>` components suspend with placeholder promises while they wait for their data to resolve on the server
- Server
  - As deferred promises resolve, their results (or errors) are serialized and streamed to the client (via Router's `router.dehydrateData()` and `router.hydrateData()` methods)
  - The resolved `<Await>` components and their suspense boundaries are resolved and their resulting HTML is streamed to the client along with their dehydrated data
- Client
  - The suspended placeholder promises within `<Await>` are resolved with the streamed data/error responses and either render the result or throw the error to the nearest error boundary
