---
id: static-prerendering
title: Static Prerendering
---

> Static Prerendering is a feature of Nitro, and while it is available in TanStack Start, we are still exploring the best practices for using it. Tread lightly!

Static prerendering is the process of generating static HTML files for your application. This can be useful for either improving the performance of your application, as it allows you to serve pre-rendered HTML files to users without having to generate them on the fly or for deploying static sites to platforms that do not support server-side rendering.

## Prerendering, powered by Nitro

TanStack Start is built on Nitro, which means we can take advantage of Nitro's prerendering capabilities. Nitro can prerender your application to static HTML files, which can then be served to users without having to generate them on the fly. To prerender your application, you can add the `deployment.prerender` option to your `app.config.js` file:

```js
// app.config.js

import { defineConfig } from '@tanstack/start/config'

export default defineConfig({
  deployment: {
    prerender: {
      routes: ['/'],
      crawlLinks: true,
    },
  },
})
```

Many of the options available for prerendering are documented in the [Nitro config prerender documentation](https://nitro.unjs.io/config#prerender).
