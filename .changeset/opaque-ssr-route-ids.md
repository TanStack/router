---
'@tanstack/router-core': patch
---

Encode dehydrated SSR route identifiers with an opaque URL-safe token so crawlers cannot interpret internal route IDs, manifest route keys, or not-found route IDs as paths.
