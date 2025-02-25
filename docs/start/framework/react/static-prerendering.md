---
id: static-prerendering
title: Static Prerendering
---

> Static Prerendering is a feature of Nitro, and while it is available in TanStack Start, we are still exploring the best practices for using it. Tread lightly!

Static prerendering is the process of generating static HTML files for your application. This can be useful for either improving the performance of your application, as it allows you to serve pre-rendered HTML files to users without having to generate them on the fly or for deploying static sites to platforms that do not support server-side rendering.

## Prerendering, powered by Nitro

TanStack Start is built on Nitro, which means we can take advantage of Nitro's prerendering capabilities. Nitro can prerender your application to static HTML files, which can then be served to users without having to generate them on the fly. To prerender your application, you can add the `server.prerender` option to your `app.config.js` file:

```js
// app.config.js

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

Many of the options available for prerendering are documented in the [Nitro config prerender documentation](https://nitro.unjs.io/config#prerender).

## Prerendering dynamic routes with Nitro

Nitro ships with some prebuilt hooks that let you customize the prerendering process among other things. One of these hooks is the `prerender:routes` hook. This hook allows you to fetch async data and add routes to a `Set` of routes to be prerendered.

For this example, let's pretend we have a blog with a list of posts. We want to prerender each post page. Our post route looks like `/posts/$postId`. We can use the `prerender:routes` hook to fetch the all of our posts and add each post path to the routes set.

```
// app.config.js

import { defineConfig } from '@tanstack/react-start/config'

export default defineConfig({
  server: {
    hooks: {
      "prerender:routes": async (routes) => {
          // fetch the pages you want to render
          const posts = await fetch('https://api.example.com/posts')
          const postsData = await posts.json()

          // add each post path to the routes set
          postsData.forEach((post) => {
            routes.add(`/posts/${post.id}`)
          })
      }
    },
    prerender: {
      routes: ['/'],
      crawlLinks: true,
    },
  },
})
```

As of writing, the [Nitro hooks documentation](https://nitro.build/config#hooks) does not include any information on the provided hooks.
