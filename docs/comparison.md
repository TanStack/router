---
title: Comparison | TanStack Router vs React Router
toc: false
---

Before you commit to a new tool, it's always nice to know how it stacks up against the competition!

> This comparison table strives to be as accurate and as unbiased as possible. If you use any of these libraries and feel the information could be improved, feel free to suggest changes (with notes or evidence of claims) using the "Edit this page on Github" link at the bottom of this page.

Feature/Capability Key:

- ✅ 1st-class, built-in, and ready to use with no added configuration or code
- 🟢 Full Support as an official plugin or addon package
- 🟡 Partial Support
- 🔶 Possible, but requires custom code/implementation/casting
- 🛑 Not officially supported

|                                                | TanStack Router                                | React Router DOM [_(Website)_][react-router]          |
| ---------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| Github Repo / Stars                            | [![][stars-tanstack-router]][gh-react-router]  | [![][stars-react-router]][gh-react-router]            |
| Bundle Size                                    | [![][bp-tanstack-router]][bpl-tanstack-router] | [![][bp-react-router]][bpl-react-router]              |
| History, Memory & Hash Routers                 | ✅                                             | ✅                                                    |
| Nested / Layout Routes                         | ✅                                             | ✅                                                    |
| Suspense-like Route Transitions                | ✅                                             | ✅                                                    |
| Typesafe Route Definitions                     | ✅                                             | 🛑                                                    |
| Loaders                                        | ✅                                             | ✅                                                    |
| Typesafe Loaders                               | ✅                                             | 🔶                                                    |
| Loader Caching (SWR + Invalidation)            | ✅                                             | 🛑                                                    |
| Actions                                        | ✅                                             | ✅                                                    |
| Typesafe Actions                               | ✅                                             | 🔶                                                    |
| Route Prefetching                              | ✅                                             | ✅                                                    |
| Auto Route Prefetching                         | ✅                                             | 🛑                                                    |
| Route Prefetching Delay                        | ✅                                             | 🔶                                                    |
| Path Params                                    | ✅                                             | ✅                                                    |
| Typesafe Path Params                           | ✅                                             | 🛑                                                    |
| Path Param Validation                          | ✅                                             | 🛑                                                    |
| Custom Path Param Parsing/Serialization        | ✅                                             | 🛑                                                    |
| Code-Splitting                                 | ✅                                             | ✅                                                    |
| Ranked Routes                                  | 🟢                                             | ✅                                                    |
| Active Link Customization                      | ✅                                             | ✅                                                    |
| Ephemeral Optimistic UI                        | ✅                                             | ✅                                                    |
| Typesafe Absolute + Relative Navigation        | ✅                                             | 🛑                                                    |
| Route Mount/Transition/Unmount Events          | ✅                                             | 🛑                                                    |
| Official Devtools                              | 🟢                                             | 🛑                                                    |
| Basic Search Params                            | ✅                                             | ✅                                                    |
| Search Param Hooks                             | ✅                                             | ✅                                                    |
| `<Link/>`/`useNavigate` Search Param API       | ✅                                             | 🟡 (search-string only via the `to`/`search` options) |
| JSON Search Params                             | ✅                                             | 🔶                                                    |
| TypeSafe Search Params                         | ✅                                             | 🛑                                                    |
| Search Param Schema Validation                 | ✅                                             | 🛑                                                    |
| Search Param Immutability + Structural Sharing | ✅                                             | 🛑                                                    |
| Custom Search Param parsing/serialization      | ✅                                             | 🔶                                                    |
| Hierarchical Search Param Transforms           | ✅                                             | 🛑                                                    |
| Async Route Elements                           | ✅                                             | 🛑                                                    |
| Suspense Route Elements                        | ✅                                             | ✅                                                    |
| Route Error Elements                           | ✅                                             | ✅                                                    |
| Route Pending Elements                         | ✅                                             | 🛑                                                    |
| Pending Timing (delay, min-show)               | ✅                                             | 🛑                                                    |
| `<Prompt>`/`usePrompt`                         | ✅                                             | 🔶                                                    |
| SSR                                            | 🛑 (Coming Soon)                               | ✅                                                    |
| Navigation Scroll Restoration                  | 🛑 (Coming Soon)                               | ✅                                                    |
| Deferred Loader Streaming                      | 🛑 (Coming Soon)                               | ✅                                                    |
| `<Form>` API                                   | 🛑                                             | ✅                                                    |

<!-- ### Notes

> **<sup>1</sup> stuff** -->

<!-- -->

[bp-tanstack-router]: https://badgen.net/bundlephobia/minzip/@tanstack/react-router@alpha?label=💾
[bpl-tanstack-router]: https://bundlephobia.com/result?p=@tanstack/react-router@alpha
[gh-tanstack-router]: https://github.com/tanstack/router
[stars-tanstack-router]: https://img.shields.io/github/stars/tanstack/router?label=%F0%9F%8C%9F

<!-- -->

[react-router]: https://github.com/remix-run/react-router
[bp-react-router]: https://badgen.net/bundlephobia/minzip/react-router-dom?label=💾
[bp-history]: https://badgen.net/bundlephobia/minzip/history?label=💾
[gh-react-router]: https://github.com/remix-run/react-router
[stars-react-router]: https://img.shields.io/github/stars/remix-run/react-router?label=%F0%9F%8C%9F
[bpl-react-router]: https://bundlephobia.com/result?p=react-router-dom
[bpl-history]: https://bundlephobia.com/result?p=history

<!-- -->
