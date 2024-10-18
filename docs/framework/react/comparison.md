---
title: Comparison | TanStack Router vs React Router
toc: false
---

Before you commit to a new tool, it's always nice to know how it stacks up against the competition!

> This comparison table strives to be as accurate and as unbiased as possible. If you use any of these libraries and feel the information could be improved, feel free to suggest changes (with notes or evidence of claims) using the "Edit this page on GitHub" link at the bottom of this page.

Feature/Capability Key:

- ✅ 1st-class, built-in, and ready to use with no added configuration or code
- 🔵 Supported via addon package
- 🟡 Partial Support
- 🔶 Possible, but requires custom code/implementation/casting
- 🛑 Not officially supported

|                                                | TanStack Router                                  | React Router DOM [_(Website)_][router]                | Next.JS [_(Website)_][nextjs]                         |
| ---------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| Github Repo / Stars                            | [![][stars-tanstack-router]][gh-tanstack-router] | [![][stars-router]][gh-router]                        | [![][stars-nextjs]][gh-nextjs]                        |
| Bundle Size                                    | [![][bp-tanstack-router]][bpl-tanstack-router]   | [![][bp-router]][bpl-router]                          | ❓                                                    |
| History, Memory & Hash Routers                 | ✅                                               | ✅                                                    | 🛑                                                    |
| Nested / Layout Routes                         | ✅                                               | ✅                                                    | 🟡                                                    |
| Suspense-like Route Transitions                | ✅                                               | ✅                                                    | ✅                                                    |
| Typesafe Routes                                | ✅                                               | 🛑                                                    | 🟡                                                    |
| Code-based Routes                              | ✅                                               | ✅                                                    | 🛑                                                    |
| File-based Routes                              | ✅                                               | ✅                                                    | ✅                                                    |
| Virtual/Programmatic File-based Routes         | ✅                                               | ✅                                                    | 🛑                                                    |
| Router Loaders                                 | ✅                                               | ✅                                                    | ✅                                                    |
| SWR Loader Caching                             | ✅                                               | 🛑                                                    | ✅                                                    |
| Route Prefetching                              | ✅                                               | ✅                                                    | ✅                                                    |
| Auto Route Prefetching                         | ✅                                               | 🔵 (via Remix)                                        | ✅                                                    |
| Route Prefetching Delay                        | ✅                                               | 🔶                                                    | 🛑                                                    |
| Path Params                                    | ✅                                               | ✅                                                    | ✅                                                    |
| Typesafe Path Params                           | ✅                                               | 🛑                                                    | 🛑                                                    |
| Path Param Validation                          | ✅                                               | 🛑                                                    | 🛑                                                    |
| Custom Path Param Parsing/Serialization        | ✅                                               | 🛑                                                    | 🛑                                                    |
| Ranked Routes                                  | ✅                                               | ✅                                                    | ✅                                                    |
| Active Link Customization                      | ✅                                               | ✅                                                    | ✅                                                    |
| Optimistic UI                                  | ✅                                               | ✅                                                    | 🔶                                                    |
| Typesafe Absolute + Relative Navigation        | ✅                                               | 🛑                                                    | 🛑                                                    |
| Route Mount/Transition/Unmount Events          | ✅                                               | 🛑                                                    | 🛑                                                    |
| Devtools                                       | ✅                                               | 🛑                                                    | 🛑                                                    |
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
| `<Block>`/`useBlocker`                         | ✅                                               | 🔶                                                    | ❓                                                    |
| SSR                                            | ✅                                               | ✅                                                    | ✅                                                    |
| Streaming SSR                                  | ✅                                               | ✅                                                    | ✅                                                    |
| Deferred Primitives                            | ✅                                               | ✅                                                    | ✅                                                    |
| Navigation Scroll Restoration                  | ✅                                               | ✅                                                    | ❓                                                    |
| Loader Caching (SWR + Invalidation)            | 🔶 (TanStack Query is recommended)               | 🛑                                                    | ✅                                                    |
| Actions                                        | 🔶 (TanStack Query is recommended)               | ✅                                                    | ✅                                                    |
| `<Form>` API                                   | 🛑                                               | ✅                                                    | ✅                                                    |
| Full-Stack APIs                                | 🛑                                               | ✅                                                    | ✅                                                    |

[bp-tanstack-router]: https://badgen.net/bundlephobia/minzip/@tanstack/react-router
[bpl-tanstack-router]: https://bundlephobia.com/result?p=@tanstack/react-router
[gh-tanstack-router]: https://github.com/tanstack/router
[stars-tanstack-router]: https://img.shields.io/github/stars/tanstack/router?label=%F0%9F%8C%9F
[_]: _
[router]: https://github.com/remix-run/react-router
[bp-router]: https://badgen.net/bundlephobia/minzip/react-router-dom
[gh-router]: https://github.com/remix-run/react-router
[stars-router]: https://img.shields.io/github/stars/remix-run/react-router?label=%F0%9F%8C%9F
[bpl-router]: https://bundlephobia.com/result?p=react-router-dom
[bpl-history]: https://bundlephobia.com/result?p=history
[_]: _
[nextjs]: https://nextjs.org/docs/routing/introduction
[bp-nextjs]: https://badgen.net/bundlephobia/minzip/next.js?label=All
[gh-nextjs]: https://github.com/vercel/next.js
[stars-nextjs]: https://img.shields.io/github/stars/vercel/next.js?label=%F0%9F%8C%9F
[bpl-nextjs]: https://bundlephobia.com/result?p=next
