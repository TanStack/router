---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

`deepEqual` now takes its flags as positional arguments — `deepEqual(a, b, partial?, explicitUndefined?)` — instead of an options object. The router's hot callers (Link option stabilization and active-state checks, `matchRoute`) no longer allocate an options object per comparison, and the comparator reads two booleans instead of a polymorphic object. `explicitUndefined` replaces `ignoreUndefined: false`. `deepEqual` is an internal helper; it stays exported for compatibility of two-argument calls.
