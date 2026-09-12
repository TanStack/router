---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Reuse built locations for Links whose destination does not depend on the current location. `buildLocation` keeps the result per options object when the build never read the current location, and the React `Link` passes one stable options object per instance, so navigations resolve unchanged Links with a lookup instead of a full build. The per-route pathname interpolation cache this replaces is removed. Link `params`, `search` and `activeOptions` are compared by value on render; an object mutated in place is picked up on the next render rather than by a navigation alone.
