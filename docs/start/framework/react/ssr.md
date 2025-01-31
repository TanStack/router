---
id: ssr
title: SSR
---

Server-side rendering (SSR) is the process of rendering your application on the server and sending or streaming the rendered HTML to the client. This can be useful for both improving the performance of your application and improving SEO, as it allows users to see the content of your application faster and allows search engines to crawl your application more easily.

## SSR Basics

TanStack Start supports server-side rendering out of the box. To enable server-side rendering, create an `app/ssr.tsx` file in your project:

```tsx
// app/ssr.tsx

import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/start/server'
import { getRouterManifest } from '@tanstack/start/router-manifest'

import { createRouter } from './router'

export default createStartHandler({
  createRouter,
  getRouterManifest,
})(defaultStreamHandler)
```

This file exports a function that creates a server-side rendering handler. The handler is created using the `createStartHandler` function from `@tanstack/start/server`, which takes an object with the following properties:

- `createRouter`: A function that creates a router for your application. This function should return a new router instance each time it is called.
- `getRouterManifest`: A function that returns a manifest of all the routes in your application.

The handler is then called with the `defaultStreamHandler` function from `@tanstack/start/server`, which is a function that streams the response to the client.
