---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

`resolvePath` (internal helper) now takes positional arguments — `resolvePath(base, to, trailingSlash?, cache?)` — so `buildLocation` and `matchRoute` no longer allocate an options object per path resolution.
