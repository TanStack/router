---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Reuse built locations for Links whose destination does not depend on the current location. `buildLocation` keeps the result per options object when the build never read the current location, and the React `Link` passes one stable options object per instance, so navigations resolve unchanged Links with a lookup instead of a full build. The per-route pathname interpolation cache this replaces is removed. Link `params`, `search` and `activeOptions` are compared by value on render, so inline object literals with unchanged contents keep reusing the Link's location. Pass a new object to change a destination; like any other React prop, an object mutated in place is not re-read.
