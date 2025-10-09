---
title: Overview
---

TanStack Router is a **type‑safe router for React and Solid applications**. It’s designed to make routing, data loading, and navigation smart, predictable, and fully integrated with TypeScript — so you can build faster, safer, and more scalable apps.

## Key Features

On top of the core features you'd expect from a modern router, TanStack Router delivers new features aimed at improving developer experience and productivity:

- **100% inferred TypeScript support** — type safety across navigation, params, and context
- **Nested & layout routes** — including pathless layouts for flexible route trees
- **File‑based or code‑based routing** — choose the style that fits your workflow
- **Built‑in data loading & caching** — with SWR‑inspired defaults and integration with TanStack Query
- **Smart navigation** — prefetching, async route elements, and error boundaries out of the box
- **First‑class search params** — JSON‑safe, validated, and easy to use like state

Unlike framework‑bound routers, TanStack Router is **framework‑agnostic at its core**, giving you the freedom to use it standalone or as part of a larger stack. It even powers [TanStack Start](https://tanstack.com/start), our full‑stack React framework built on Router.

[//]: # 'Comparison'

## Comparison

Before selecting a router or framework, it’s useful to compare the available options to understand how they differ. The table below compares **TanStack Router / Start**, **React Router**, and **Next.js** across a range of features and capabilities.

> This comparison table strives to be as accurate and as unbiased as possible. If you use any of these libraries and feel the information could be improved, feel free to suggest changes (with notes or evidence of claims) using the "Edit this page on GitHub" link at the bottom of this page.

### Legend

- ✅ First-class: built-in and ready to use with no extra setup
- 🟡 Partial support (scale of 5)
- 🟠 Supported via addon or community package
- 🔶 Possible with custom code or workarounds
- 🛑 Not officially supported

|                                                | TanStack Router / Start                          | React Router DOM [_(Website)_][router]                | Next.JS [_(Website)_][nextjs]                         |
| ---------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| Github Repo / Stars                            | [![][stars-tanstack-router]][gh-tanstack-router] | [![][stars-router]][gh-router]                        | [![][stars-nextjs]][gh-nextjs]                        |
| Bundle Size                                    | [![][bp-tanstack-router]][bpl-tanstack-router]   | [![][bp-router]][bpl-router]                          | ❓                                                    |
| History, Memory & Hash Routers                 | ✅                                               | ✅                                                    | 🛑                                                    |
| Nested / Layout Routes                         | ✅                                               | ✅                                                    | 🟡                                                    |
| Suspense-like Route Transitions                | ✅                                               | ✅                                                    | ✅                                                    |
| Typesafe Routes                                | ✅                                               | 🟡 (1/5)                                              | 🟡                                                    |
| Code-based Routes                              | ✅                                               | ✅                                                    | 🛑                                                    |
| File-based Routes                              | ✅                                               | ✅                                                    | ✅                                                    |
| Virtual/Programmatic File-based Routes         | ✅                                               | ✅                                                    | 🛑                                                    |
| Router Loaders                                 | ✅                                               | ✅                                                    | ✅                                                    |
| SWR Loader Caching                             | ✅                                               | 🛑                                                    | ✅                                                    |
| Route Prefetching                              | ✅                                               | ✅                                                    | ✅                                                    |
| Auto Route Prefetching                         | ✅                                               | ✅                                                    | ✅                                                    |
| Route Prefetching Delay                        | ✅                                               | 🔶                                                    | 🛑                                                    |
| Path Params                                    | ✅                                               | ✅                                                    | ✅                                                    |
| Typesafe Path Params                           | ✅                                               | ✅                                                    | 🛑                                                    |
| Typesafe Route Context                         | ✅                                               | 🛑                                                    | 🛑                                                    |
| Path Param Validation                          | ✅                                               | 🛑                                                    | 🛑                                                    |
| Custom Path Param Parsing/Serialization        | ✅                                               | 🛑                                                    | 🛑                                                    |
| Ranked Routes                                  | ✅                                               | ✅                                                    | ✅                                                    |
| Active Link Customization                      | ✅                                               | ✅                                                    | ✅                                                    |
| Optimistic UI                                  | ✅                                               | ✅                                                    | 🔶                                                    |
| Typesafe Absolute + Relative Navigation        | ✅                                               | 🟡 (1/5 via `buildHref` util)                         | 🟠 (IDE plugin)                                       |
| Route Mount/Transition/Unmount Events          | ✅                                               | 🛑                                                    | 🛑                                                    |
| Devtools                                       | ✅                                               | 🟠                                                    | 🛑                                                    |
| Basic Search Params                            | ✅                                               | ✅                                                    | ✅                                                    |
| Search Param Hooks                             | ✅                                               | ✅                                                    | ✅                                                    |
| `<Link/>`/`useNavigate` Search Param API       | ✅                                               | 🟡 (search-string only via the `to`/`search` options) | 🟡 (search-string only via the `to`/`search` options) |
| JSON Search Params                             | ✅                                               | 🔶                                                    | 🔶                                                    |
| TypeSafe Search Params                         | ✅                                               | 🛑                                                    | 🛑                                                    |
| Search Param Schema Validation                 | ✅                                               | 🛑                                                    | 🛑                                                    |
| Search Param Immutability + Structural Sharing | ✅                                               | 🔶                                                    | 🛑                                                    |
| Custom Search Param parsing/serialization      | ✅                                               | 🔶                                                    | 🛑                                                    |
| Search Param Middleware                        | ✅                                               | 🛑                                                    | 🛑                                                    |
| Suspense Route Elements                        | ✅                                               | ✅                                                    | ✅                                                    |
| Route Error Elements                           | ✅                                               | ✅                                                    | ✅                                                    |
| Route Pending Elements                         | ✅                                               | ✅                                                    | ✅                                                    |
| `<Block>`/`useBlocker`                         | ✅                                               | 🔶 (no hard reloads or cross-origin navigation)       | 🛑                                                    |
| Deferred Primitives                            | ✅                                               | ✅                                                    | ✅                                                    |
| Navigation Scroll Restoration                  | ✅                                               | ✅                                                    | ❓                                                    |
| ElementScroll Restoration                      | ✅                                               | 🛑                                                    | 🛑                                                    |
| Async Scroll Restoration                       | ✅                                               | 🛑                                                    | 🛑                                                    |
| Router Invalidation                            | ✅                                               | ✅                                                    | ✅                                                    |
| Runtime Route Manipulation (Fog of War)        | 🛑                                               | ✅                                                    | ✅                                                    |
| Parallel Routes                                | 🛑                                               | 🛑                                                    | ✅                                                    |
| **Full Stack**                                 | --                                               | --                                                    | --                                                    |
| SSR                                            | ✅                                               | ✅                                                    | ✅                                                    |
| Streaming SSR                                  | ✅                                               | ✅                                                    | ✅                                                    |
| Generic RPCs                                   | ✅                                               | 🛑                                                    | 🛑                                                    |
| Generic RPC Middleware                         | ✅                                               | 🛑                                                    | 🛑                                                    |
| React Server Functions                         | ✅                                               | 🛑                                                    | ✅                                                    |
| React Server Function Middleware               | ✅                                               | 🛑                                                    | 🛑                                                    |
| API Routes                                     | ✅                                               | ✅                                                    | ✅                                                    |
| API Middleware                                 | ✅                                               | 🛑                                                    | ✅                                                    |
| React Server Components                        | 🛑                                               | 🟡 (Experimental)                                     | ✅                                                    |
| `<Form>` API                                   | 🛑                                               | ✅                                                    | ✅                                                    |

[bp-tanstack-router]: https://badgen.net/bundlephobia/minzip/@tanstack/react-router
[bpl-tanstack-router]: https://bundlephobia.com/result?p=@tanstack/react-router
[gh-tanstack-router]: https://github.com/tanstack/router
[stars-tanstack-router]: https://img.shields.io/github/stars/tanstack/router?label=%F0%9F%8C%9F
[_]: _
[router]: https://github.com/remix-run/react-router
[bp-router]: https://badgen.net/bundlephobia/minzip/react-router
[gh-router]: https://github.com/remix-run/react-router
[stars-router]: https://img.shields.io/github/stars/remix-run/react-router?label=%F0%9F%8C%9F
[bpl-router]: https://bundlephobia.com/result?p=react-router
[bpl-history]: https://bundlephobia.com/result?p=history
[_]: _
[nextjs]: https://nextjs.org/docs/routing/introduction
[bp-nextjs]: https://badgen.net/bundlephobia/minzip/next.js?label=All
[gh-nextjs]: https://github.com/vercel/next.js
[stars-nextjs]: https://img.shields.io/github/stars/vercel/next.js?label=%F0%9F%8C%9F
[bpl-nextjs]: https://bundlephobia.com/result?p=next
[//]: # 'Comparison'

## Acknowledgements

TanStack Router builds on proven concepts and patterns introduced by several outstanding open‑source projects, including:

- [TRPC](https://trpc.io/)
- [Remix](https://remix.run)
- [Chicane](https://swan-io.github.io/chicane/)
- [Next.js](https://nextjs.org)

We greatly appreciate the innovation, effort, and experimentation these projects haev contributed to the ecosystem, and we’re excited to build on their foundations to raise the bar even higher.
