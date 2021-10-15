---
id: overview
title: Overview
---

React Location started as a solution to small roadblocks I experienced in the mostly wonderful APIs of [React Router](https://reactrouter.com/) and the [Next.js Router](https://nextjs.org/docs/api-reference/next/router).

### URL Search/Query State

Most applications, even large ones will get away with requiring only a few string-based search query params in the url, probably something like `?page=3` or `?filter-name=tanner`. The main reason you'll find this **state** inside of the URL is because it's linkability and shareability is very important. Your users should be able to bookmark/copy-paste/share a link from your app and have consistency with the original state of the page.

When you begin to store more state in the URL you will inevitably and naturally want to reach for JSON to store it. Storing JSON state in the URL has it's own complications involving:

- Parsing/Serialization
- Immutability & Structural Sharing
- Compression & Readablity
- Powerful Declarative & Imperative APIs to manipulate query state

React Location handles all of this out of the box.

### Client-side Navigational Suspense

Popularized by frameworks like [Next.js](https://nextjs.org) and [Remix](https://remix.run), **specifying asynchronous dependencies for routes that can all resolve in parallel before rendering** has become an expectation of almost every SSR-based routing APIs. I believe this capability, while intuitive in an SSR environment, is not exclusive to it and definitely has a place in the client-side routing world.

React Location provides first-class support for specifying arbitrary asynchronous dependencies for your routes and will asynchronously suspend navigation rendering until these dependencies are met.

Don't like the initial fallback showing on the client while mouting? React Location provides the ability to both:

- Match and pre-load route data during SSR and also
- Supply pre-loaded route data during rehydration

### But Tanner, why didn't you just PR/plugin/proxy/add this functionality into an existing router?

I tried so hard, I promise! I gave my best and most fervent attempt to proxy React Router v6 (argubly the only worthy router in the ecosystem to try this with) to achieve these features, but after hitting the ceiling on its public API and quite literally proxying and re-exporting every single function/variable/type from the library, I realized that unless the core internals of React Router were exposed (which would require yet another breaking change on its part) the idea was dead on arrival. Only then, did I know it was time to design a new router from the ground up with support for the features I needed.

## Features

- Deeply integrated URL Search API ()
  - JSON
  - Immutable w/ Structural Sharing
  - Compression
  - Types
- Deep-Route Loaders (for data, images, assets, readiness, etc.)
- Asynchronous Routes (module-splitting, dynamic routes)
