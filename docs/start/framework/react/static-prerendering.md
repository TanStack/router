---
id: static-prerendering
title: Static Prerendering
---

Static prerendering is the process of generating static HTML files for your application. This can be useful for either improving the performance of your application, as it allows you to serve pre-rendered HTML files to users without having to generate them on the fly or for deploying static sites to platforms that do not support server-side rendering.

## Prerendering

TanStack Start can prerender your application to static HTML files, which can then be served to users without having to generate them on the fly. To prerender your application, you can add the `prerender` option to your tanstackStart configuration in `vite.config.ts` file:

```ts
// vite.config.ts

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [
    tanstackStart({
      prerender: {
        // Enable prerendering
        enabled: true,
      },
      // Optional configuration for specific pages—without this, it will still automatically
      // prerender all pages
      pages: [
        {
          path: '/my-page',
          // By default, html files will be named the the same as their route, so `my-page.tsx` would become
          // `/my-page.html`. However, in order to have a URL path like `/my-page`, it should be an index
          // inside a directory like so:
          prerender: { enabled: true, outputPath: '/my-page/index.html' },
        },
      ],
      // Optional function to do the above globally.
      outputPath: (path) =>
        path.endsWith('index') ? `$[path}.html` : `${path}/index.html`,
    }),
  ],
})
```
