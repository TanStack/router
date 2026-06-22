---
'@tanstack/router-core': patch
---

Resolve a match to `error` instead of `success` when its loader is aborted before producing data. Previously an aborted loader could leave the match in `success` with `loaderData` undefined, so the route component rendered while `useLoaderData()` returned `undefined` despite its non-undefined type.
