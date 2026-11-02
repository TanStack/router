---
'@tanstack/start-plugin-core': minor
'@tanstack/react-start': minor
'@tanstack/solid-start': minor
'@tanstack/vue-start': minor
---

Import protection: new `allowImport(info)` option, and `onViolation` only reports.

- `allowImport` runs during the build, before an import is replaced by its mock, in dev and in builds, once per import. Returning `true` gives the import the real module: it is not a violation, nothing is reported, and `onViolation` is not called. `false` or nothing is the normal outcome under `behavior`. It also sees imports tree-shaking removes later, so use it to decide, not to report, and give stable answers. Its `info` is `onViolation`'s without `trace` and `snippet`: the graph is not finished, and a snippet is rendered for reports.
- `onViolation` runs after the build for imports that survive tree-shaking and were not allowed, and returns nothing. **If you returned `false` to allow an import, move that decision to `allowImport` and return `true`:** returning `false` now does nothing but print a message saying so.
- A build no longer runs an environment a second time, which fixes `build --watch` writing no client and `rsbuild build` never exiting under RSC when an import was allowed. With RSC, a `'use client'` file allowed from `rsc` is the real module in `ssr` too.
