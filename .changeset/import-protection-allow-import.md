---
'@tanstack/start-plugin-core': minor
'@tanstack/react-start': minor
'@tanstack/solid-start': minor
'@tanstack/vue-start': minor
---

Import protection: new `allowImport(info)` option, and `onViolation` only reports.

- `allowImport` runs during the build, before an import is replaced by its mock, in dev and in builds, once per import. Returning `true` gives the import the real module: it is not a violation, nothing is reported, and `onViolation` is not called. `false` or nothing is the normal outcome under `behavior`. It also sees imports that tree-shaking removes later, so use it to decide, not to report, and give stable answers. Its `info` is `onViolation`'s without `trace` and `snippet`.
- `onViolation` runs during the build, after tree-shaking of the importing environment, for imports that survive tree-shaking and were not allowed, and returns nothing. **If you returned `false` to allow an import, move that decision to `allowImport` and return `true`:** returning `false` now does nothing but print a message saying so. It used to silence the report, while a `.server` file stayed mocked and a file with a `server-only` marker shipped for real.
- With RSC, a `'use client'` file allowed from `rsc` is the real module in `ssr` too.
