---
id: static-server-functions
title: Static Server Functions
---

## What are Static Server Functions?

Static server functions are server functions that are executed at build time and cached as static assets when using prerendering/static-generation. They can be set to "static" mode by passing the `type: 'static'` option to `createServerFn`:

```tsx
const myServerFn = createServerFn({ type: 'static' }).handler(async () => {
  return 'Hello, world!'
})
```

This pattern goes as follows:

- Build-time
  - During build-time prerendering, a server function with `type: 'static'` is executed
  - The result is cached with your build output as a static JSON file under a derived key (function ID + params/payload hash)
  - The result is returned as normal during prerendering/static-generation and used to prerender the page
- Runtime
  - Initially, the prerendered page's html is served and the server function data is embedded in the html
  - When the client mounts, the embedded server function data is hydrated
  - For future client-side invocations, the server function is replaced with a fetch call to the static JSON file

## Customizing the Server Functions Static Cache

By default, the static server function cache implementation stores and retrieves static data in the build output directory via node's `fs` module and likewise fetches the data at runtime using a `fetch` call to the same static file.

This interface can be customized by importing and calling the `createServerFnStaticCache` function to create a custom cache implementation and then calling `setServerFnStaticCache` to set it:

```tsx
import {
  createServerFnStaticCache,
  setServerFnStaticCache,
} from '@tanstack/start/client'

const myCustomStaticCache = createServerFnStaticCache({
  setItem: async (ctx, data) => {
    // Store the static data in your custom cache
  },
  getItem: async (ctx) => {
    // Retrieve the static data from your custom cache
  },
  fetchItem: async (ctx) => {
    // During runtime, fetch the static data from your custom cache
  },
})

setServerFnStaticCache(myCustomStaticCache)
```
