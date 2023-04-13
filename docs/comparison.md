---
title: Comparison | TanStack Router vs React Router
toc: false
---

Before you commit to a new tool, it's always nice to know how it stacks up against the competition!

> This comparison table strives to be as accurate and as unbiased as possible. If you use any of these libraries and feel the information could be improved, feel free to suggest changes (with notes or evidence of claims) using the "Edit this page on GitHub" link at the bottom of this page.

Feature/Capability Key:

- ✅ 1st-class, built-in, and ready to use with no added configuration or code
- 🟢 Full Support as an official plugin or addon package
- 🟡 Partial Support
- 🔶 Possible, but requires custom code/implementation/casting
- 🛑 Not officially supported

|                                                | TanStack Router                                  | React Router DOM [_(Website)_][router]                | Next.JS [_(Website)_][nextjs]                         |
| ---------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| Github Repo / Stars                            | [![][stars-tanstack-router]][gh-tanstack-router] | [![][stars-router]][gh-router]                        | [![][stars-nextjs]][gh-nextjs]                        |
| Bundle Size                                    | [![][bp-tanstack-router]][bpl-tanstack-router]   | [![][bp-router]][bpl-router]                          | ❓                                                    |
|                                                | [![][bp-tanstack-loaders]][bpl-tanstack-loaders] |                                                       |                                                       |
|                                                | [![][bp-tanstack-actions]][bpl-tanstack-actions] |                                                       |                                                       |
| History, Memory & Hash Routers                 | ✅                                               | ✅                                                    | 🛑                                                    |
| Nested / Layout Routes                         | ✅                                               | ✅                                                    | ✅                                                    |
| Suspense-like Route Transitions                | ✅                                               | ✅                                                    | ✅                                                    |
| Typesafe Routes                                | ✅                                               | 🛑                                                    | 🛑                                                    |
| Loaders                                        | 🟢                                               | ✅                                                    | ✅                                                    |
| Typesafe Loaders                               | 🟢                                               | 🔶                                                    | 🛑                                                    |
| Loader Caching (SWR + Invalidation)            | 🟢                                               | 🛑                                                    | ✅                                                    |
| Actions                                        | 🟢                                               | ✅                                                    | 🛑                                                    |
| Typesafe Actions                               | 🟢                                               | 🔶                                                    | 🛑                                                    |
| Route Prefetching                              | ✅                                               | ✅                                                    | ✅                                                    |
| Auto Route Prefetching                         | ✅                                               | 🛑                                                    | ✅                                                    |
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
| Devtools                                       | 🟢                                               | 🛑                                                    | 🛑                                                    |
| Basic Search Params                            | ✅                                               | ✅                                                    | ✅                                                    |
| Search Param Hooks                             | ✅                                               | ✅                                                    | ✅                                                    |
| `<Link/>`/`useNavigate` Search Param API       | ✅                                               | 🟡 (search-string only via the `to`/`search` options) | 🟡 (search-string only via the `to`/`search` options) |
| JSON Search Params                             | ✅                                               | 🔶                                                    | 🔶                                                    |
| TypeSafe Search Params                         | ✅                                               | 🛑                                                    | 🛑                                                    |
| Search Param Schema Validation                 | ✅                                               | 🛑                                                    | 🛑                                                    |
| Search Param Immutability + Structural Sharing | ✅                                               | 🛑                                                    | 🛑                                                    |
| Custom Search Param parsing/serialization      | ✅                                               | 🔶                                                    | 🛑                                                    |
| Search Param Middleware                        | ✅                                               | 🛑                                                    | 🛑                                                    |
| Async Route Elements                           | ✅                                               | 🛑                                                    | ✅                                                    |
| Suspense Route Elements                        | ✅                                               | ✅                                                    | ✅                                                    |
| Route Error Elements                           | ✅                                               | ✅                                                    | ✅                                                    |
| Route Pending Elements                         | ✅                                               | 🛑                                                    | ✅                                                    |
| `<Prompt>`/`usePrompt`                         | ✅                                               | 🔶                                                    |                                                       |
| SSR                                            | ✅                                               | ✅                                                    | ✅                                                    |
| Navigation Scroll Restoration                  | 🛑                                               | ✅                                                    | 🛑                                                    |
| Deferred Loader Streaming                      | 🛑                                               | ✅                                                    | 🔶                                                    |
| `<Form>` API                                   | 🛑                                               | ✅                                                    | 🛑                                                    |

[bp-tanstack-router]: https://badgen.net/bundlephobia/minzip/@tanstack/router@beta?label=Router
[bpl-tanstack-router]: https://bundlephobia.com/result?p=@tanstack/router@beta
[bp-tanstack-loaders]: https://badgen.net/bundlephobia/minzip/@tanstack/react-loaders@beta?label=Loaders
[bpl-tanstack-loaders]: https://bundlephobia.com/result?p=@tanstack/react-loaders@beta
[bp-tanstack-actions]: https://badgen.net/bundlephobia/minzip/@tanstack/react-actions@beta?label=Actions
[bpl-tanstack-actions]: https://bundlephobia.com/result?p=@tanstack/react-actions@beta
[gh-tanstack-router]: https://github.com/tanstack/router
[stars-tanstack-router]: https://img.shields.io/github/stars/tanstack/router?label=%F0%9F%8C%9F
[_]: _
[router]: https://reactrouter.com
[bp-router]: https://badgen.net/bundlephobia/minzip/react-router-dom?label=All
[gh-router]: https://github.com/remix-run/react-router
[stars-router]: https://img.shields.io/github/stars/remix-run/react-router?label=%F0%9F%8C%9F
[bpl-router]: https://bundlephobia.com/result?p=react-router-dom
[_]: _
[bp-nextjs]: https://badgen.net/bundlephobia/minzip/next.js?label=All
[gh-nextjs]: https://github.com/vercel/next.js
[stars-nextjs]: https://img.shields.io/github/stars/vercel/next.js?label=%F0%9F%8C%9F
[bpl-nextjs]: https://bundlephobia.com/result?p=next
