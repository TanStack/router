---
'@tanstack/router-core': patch
---

Fixed `commitLocation` comparing the internal `latestLocation.href` against the public `next.href`, which made same-location navigations (e.g. to `/` when `basepath` is `/app`) no-op or push duplicate history entries.
