---
'@tanstack/router-core': patch
---

Fix `DehydratedMatch['b']`, which was typed by `RouteMatch['__beforeLoadContext']` — a field tagged `@internal`. This worked fine until `stripInternal` was enabled in fd341ad (PR #4907), which strips `@internal` members from the published `.d.ts` and left this reference dangling since `router-core@1.171.16`. Consumers with `skipLibCheck: false` (the TS default) hit a `tsc` error on `@tanstack/router-core`'s own shipped types. Fixed by giving `b` the declared type of `__beforeLoadContext` instead of indexing into the stripped member.
