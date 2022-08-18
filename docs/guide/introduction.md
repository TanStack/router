---
title: Overview
---

TanStack Router is an router for building applications in React, Vue, Svelte, Solid and other modern web frameworks. It features:

- Route loaders & actions
- Asynchronous route elements
- Threshold-based pending route elements
- Error boundary route elements
- Code-splitting
- JSON-first Search Params
- Search Param aware links and navigation
- Full `cmd+click` support
- Search Param Immutability w/ Structural Sharing
- Functional update APIs for search params, hash and history state
- Search Param Route Matching (object/predicate)
- Custom Search Param parser/serializer support
- Hierarchical 2-stage search param manipulation for all links and navigation
- Prefetching
- Route filtering/ranking
- Object OR JSX route definitions

## Acknowledgements

TanStack Router has been inspired by many other OSS projects, including:

- [Remix](https://remix.run)
- [Next.js](https://nextjs.org)
- [TRPC](https://trpc.io/)

We acknowledge the risk and research that went into their development and are excited to continue pushing their ideals and concepts into the future.

### Async Routing

TanStack router implements the loader/action paradigm popularized by Remix to allow routes to define their critical data dependencies and potential actions in a declarative way. Together with error boundaries and pending states, routes are able to use loaders/actions to keep most if not all asynchronous code out of the components that render them.

In addition to loaders and actions, routes also support:

- Asynchronous route elements and pending elements.
- Asynchronous import of a route's options for higher level code-splitting
- Imperative and Intent-based Preloading of assets before navigation events

### Search Params

TanStack Router aims to finally make storing state in the URL an easy task. We've baked in URL Search Param management right into the core of the router with just the right level of abstraction and flexibility. URLs are inherently more sharable, bookmarkable and more consistent across app navigation than any other state management approach and we believe developers would opt for URL state more if their tools to manage it were better.

### So much more!

Enough overview, there's so much more to do with TanStack Router. Hit that next button and let's get started!
