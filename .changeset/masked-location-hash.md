---
'@tanstack/router-core': patch
---

Keep the '#' of the hash when storing the location under a route mask, so `latestLocation.href` no longer appends the hash to the path.
