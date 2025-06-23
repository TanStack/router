---
id: static-prerendering
title: Static Prerendering
---

Static prerendering is the process of generating static HTML files for your application. This can be useful for either improving the performance of your application, as it allows you to serve pre-rendered HTML files to users without having to generate them on the fly or for deploying static sites to platforms that do not support server-side rendering.

## Prerendering

TanStack Start can prerender your application to static HTML files, which can then be served to users without having to generate them on the fly. To prerender your application, you can add the `server.prerender` option to your `app.config.ts` file:

```ts
// app.config.ts

import { defineConfig } from '@tanstack/react-start/config'

export default defineConfig({
  server: {
    prerender: {
      routes: ['/'],
      crawlLinks: true,
    },
  },
})
```
