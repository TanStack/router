---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Mounted `<Link>`s whose destination never reads the current location (an absolute `to`, params they supply themselves, a literal or absent `search`/`hash`/`state`, no mask) no longer rebuild it on every navigation: `buildLocation` reuses the location it already built. Pages with many such links navigate substantially faster.
