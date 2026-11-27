---
'@tanstack/router-core': patch
---

Links mount and rebuild their hrefs faster. When a Link's destination doesn't depend on the current location, the router caches the built location on the Link's own options object instead of in a `WeakMap`, so repeated builds skip the map lookup.
