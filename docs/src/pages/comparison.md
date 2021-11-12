---
id: comparison
title: Comparison | React Location vs React Router
---

> This comparison table strives to be as accurate and as unbiased as possible. If you use any of these libraries and feel the information could be improved, feel free to suggest changes (with notes or evidence of claims) using the "Edit this page on Github" link at the bottom of this page.

Feature/Capability Key:

- ✅ 1st-class, built-in, and ready to use with no added configuration or code
- 🟦 Full Support as an official plugin or addon package
- 🟡 Partial Support
- 🔶 Possible, but requires custom code/implementation
- 🛑 Not officially supported

|                                                  | React Location                                                | React Router DOM [_(Website)_][react-router]                |
| ------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Github Repo / Stars                              | [![][stars-react-location]][gh-react-location]                | [![][stars-react-router]][gh-react-router]                  |
| Their Comparison                                 |                                                               | (none)                                                      |
| Bundle Size                                      | [![][bp-react-location]][bpl-react-location] (react-location) | [![][bp-react-router]][bpl-react-router] (react-router-dom) |
|                                                  | -                                                             | [![][bp-history]][bpl-history] (history)                    |
| **General**                                      |                                                               |                                                             |
| Nested / Layout Routes                           | ✅                                                            | ✅                                                          |
| Path Params                                      | ✅                                                            | ✅                                                          |
| JSX Routes                                       | 🛑 (🟦 Coming soon!)                                          | ✅                                                          |
| Code-Splitting                                   | ✅                                                            | ✅                                                          |
| Ranked Routes                                    | 🟦 (`react-location-ranked-routes`)                           | ✅                                                          |
| Active Link Customization                        | ✅                                                            | ✅                                                          |
| SSR                                              | ✅                                                            | ✅                                                          |
| **Search Params**                                |                                                               |                                                             |
| Basic Search Params                              | ✅                                                            | ✅                                                          |
| Search Param Hook                                | ✅                                                            | ✅                                                          |
| Integrated `<Link/>` search param API            | ✅                                                            | 🟡 (search-string only via the `to` prop)                   |
| Integrated `useNavigate` search param API        | ✅                                                            | 🟡 (search-string only via the `search` property)           |
| JSON Search Params                               | ✅                                                            | 🔶                                                          |
| Search Param Stabilization (Structural Sharing)  | ✅                                                            | 🔶                                                          |
| Custom Search Param parsing/serialization        | ✅                                                            | 🔶                                                          |
| Queued/Batched Search Param Updates              | ✅                                                            | 🛑                                                          |
| Search-Based Route Matching                      | ✅                                                            | 🟡 (string/Regex only?)                                     |
| Search Param Compression                         | 🟦 (`react-location-jsurl`)                                   | 🔶                                                          |
| **Async Routing, Loaders & Data**                |                                                               |                                                             |
| Route Loaders & Data (parallelized and blocking) | ✅                                                            | 🛑                                                          |
| Basic Route Data Caching                         | ✅                                                            | 🛑                                                          |
| Route Loader Prefetching                         | ✅                                                            | 🛑                                                          |
| External Caching Interface                       | ✅                                                            | 🛑                                                          |
| Route Error Elements                             | ✅                                                            | 🛑                                                          |
| Route Pending Elements                           | ✅                                                            | 🛑                                                          |
| Pending Timing (delay, min-show)                 | ✅                                                            | 🛑                                                          |

<!-- ### Notes

> **<sup>1</sup> stuff** -->

<!-- -->

[bp-react-location]: https://badgen.net/bundlephobia/minzip/react-location?label=💾
[bpl-react-location]: https://bundlephobia.com/result?p=react-location
[gh-react-location]: https://github.com/tannerlinsley/react-location
[stars-react-location]: https://img.shields.io/github/stars/tannerlinsley/react-location?label=%F0%9F%8C%9F

<!-- -->

[react-router]: https://github.com/remix-run/react-router
[bp-react-router]: https://badgen.net/bundlephobia/minzip/react-router-dom?label=💾
[bp-history]: https://badgen.net/bundlephobia/minzip/history?label=💾
[gh-react-router]: https://github.com/remix-run/react-router
[stars-react-router]: https://img.shields.io/github/stars/remix-run/react-router?label=%F0%9F%8C%9F
[bpl-react-router]: https://bundlephobia.com/result?p=react-router-dom
[bpl-history]: https://bundlephobia.com/result?p=history

<!-- -->
