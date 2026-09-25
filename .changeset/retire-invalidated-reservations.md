---
'@tanstack/router-core': patch
---

Abort reserved loader generations with no remaining owners when invalidation removes them from discovery, ensuring their public abort signals are retired.
