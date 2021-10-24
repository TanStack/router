---
id: overview
title: Overview
---

React Location is a router for browser-based React applications that strives to provide a powerful API and deep integration for advanced routing use-cases.

Here's a quick glance at some of its features:

- Deeply integrated Search Params API
  - Route Matching
  - Full `<Link>` and `useNavigate` support
  - `cmd+click` support
  - JSON State/Storage
  - Immutability w/ Structural Sharing
  - Optional Compression w/ JSURL plugin or your own custom parser/serializer!
  - Types
- Promise-based route loaders
- Post-render Async loader APIs (stale-while-revalidate, external cache integration)
- Asynchronous route definitions
- Asynchronous element definitions
- Error boundary route elements
- Threshold-based pending route elements
- Route state hooks (data)
- Router state hooks
- Optional route filtering/ranking API
- Prepackaged simple cache implementation for simple route loader caching
- Integration w/ external caches and storage (eg. React Query)
- SSR route matching, loading & hydration

## Wait, another router? 🤔

React Location initially began to solve smaller issues I was experiencing with the mostly wonderful APIs of [React Router](https://reactrouter.com/) and the [Next.js Router](https://nextjs.org/docs/api-reference/next/router). Over time, its API gave way to even more features, flexibiliy, better DX, and more power to build my applications how I saw fit.

Here's some of those challenges and the features that solve them:

### URL Search Param Matching and state management

Most applications, even large ones will get away with requiring only a few string-based search query params in the url, probably something like `?page=3` or `?filter-name=tanner`. The main reason you'll find this **state** inside of the URL is because while it may not fit the hierarchical patterns of the pathname, it's still very important to the output of a page. Both the ability to build and match routes on this state and your ability as a developer to manipulate this state without restrction is paramount to your app's developer and user experience. Your users should be able to bookmark/copy-paste/share a link from your app and have consistency with the original state of the page.

When you begin to store more state in the URL you will inevitably and naturally want to reach for JSON to store it. Storing JSON state in the URL has its own complications involving:

- Route Matching. Path matching for routes is really only a small part of what a decently designed route tree can do. Being able to match on search params (in its many flavors) should not be considered a "plugin" or afterthought. It should be one of the most integrated and powerful parts of the API.
- Parsing/Serialization. I'm talking about full-customization here; BYO stringifier/parser.
- Immutability & Structural Sharing. This one is tricky to explain, but essentially it will save you from the inevitable infinite side-effect rerenders.
- Compression & Readablity. While not out-of-the-box, this is usually desired, so making it simple to get should be as simple as including a library.
- Low-level declarative APIs to manipulate query state (thing `<Link>`, `<Navigate>` and `useNavigate`). This is one where most routers can't or won't go. To do this correctly, you have to buy into your search-param APIs whole-sale at the core of the architecture and provide them as a consistent experience through the entire library.

Let's just say React Location doesn't skimp on search params. It handles all of this out of the box and goes the extra mile!

### Client-side Navigational Suspense

Popularized by frameworks like [Next.js](https://nextjs.org) and now [Remix](https://remix.run), **specifying asynchronous dependencies for routes that can all resolve in parallel before rendering** has become an expectation of almost every SSR-based routing APIs. I believe this capability, while intuitive in an SSR environment, is not exclusive to it and definitely has a place in the client-side routing world.

React Location provides first-class support for specifying arbitrary asynchronous dependencies for your routes and will asynchronously suspend navigation rendering until these dependencies are met.

Don't like the initial fallback showing on the client while mouting? React Location provides the ability to both:

- Match and pre-load route data during SSR and also
- Supply pre-loaded route data during rehydration

### Why not simply PR/plugin/proxy/add these features into an existing router?

I tried and initially succeeded in proxying React Router v6 (arguably the only worthy router in the ecosystem to try this with) to achieve these features. I even shipped it to prodution for 6 months on a beta release! However, after hitting the ceiling on its public API and quite literally proxying and re-exporting every single function/variable/type from the library, I realized that unless the core internals of React Router were both exposed and altered (which would require yet another breaking change on its part) my RR plugin could not provide consistent features and simply just not going to work with new ones. Only then, did I know it was time to design a new router from the ground up with support for the features I needed.
